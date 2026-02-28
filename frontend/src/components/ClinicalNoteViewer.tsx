import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Divider,
  Box,
  List,
  ListItem,
  ListItemText,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import api from "../lib/api";
import SnackbarToast from "./SnackbarToast";
import ConfirmDialog from "./ConfirmDialog";
import NoPatientFoundDialog from "./NoPatientFoundDialog";

type Props = {
  source: string;
  presignEndpoint?: string;
  autoPoll?: boolean;
  pollTimeoutMs?: number;
  className?: string;
};

type ParsedNote = {
  patientDetails?: Record<string, string>;
  medicalHistory?: string[];
  problemFaced?: string | string[];
  doctorInstructions?: string[];
  medicationPrescribed?: string[];
  raw?: string;
};

type Patient = Record<string, any> & { id?: string; _id?: string };

export default function ClinicalNoteViewer({
  source,
  presignEndpoint = "/",
  autoPoll = false,
  pollTimeoutMs = 60_000,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [_savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const [editState, setEditState] = useState<{ raw?: string; parsed?: ParsedNote }>({
    raw: undefined,
    parsed: undefined,
  });

  // Patient match picker state
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [showMatchPicker, setShowMatchPicker] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);

  // Snackbar state
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "info" | "warning" | "error">("success");

  // Reset confirm dialog
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // optional: disable confirm while resetting
  const [resetting, setResetting] = useState(false);

  // dialog for no-match create
  const [noPatientDialogOpen, setNoPatientDialogOpen] = useState(false);
  const [noPatientDialogInitial, setNoPatientDialogInitial] = useState<{ fullName?: string; age?: string | number; phone?: string; gender?: string } | null>(null);
  const [creatingFromNoPatientDialog, setCreatingFromNoPatientDialog] = useState(false);



  // Initialize edit state after fetch
  useEffect(() => {
    setEditState({ raw: noteText ?? parsed?.raw ?? undefined, parsed: parsed ?? undefined });
  }, [noteText, parsed]);

  // ----- Keep your presign / parsing / fetch functions (unchanged logic) -----
  const isPresignedUrl = (s: string) => {
    try {
      const u = new URL(s);
      return u.search.length > 0;
    } catch {
      return false;
    }
  };

  const getPresignedUrlForKey = async (key: string): Promise<string> => {
    if (isPresignedUrl(key)) return key;
    const url = `${presignEndpoint}?key=${encodeURIComponent(key)}`;
    const resp = await axios.get(url);
    const data = resp.data;
    if (typeof data === "string") return data;
    if (data?.url) return data.url;
    throw new Error("Unexpected presign endpoint response");
  };

  const normalizeText = (s: string) => s.replace(/^\uFEFF/, "");

  const HEADINGS = [
    { key: "patientDetails", labelRegex: /patient details[:\n]/i },
    { key: "medicalHistory", labelRegex: /medical history[:\n]/i },
    { key: "problemFaced", labelRegex: /(problem faced|chief complaint|chief complaint:)[:\n]?/i },
    { key: "doctorInstructions", labelRegex: /(doctor instructions|doctor's instructions|instructions)[:\n]/i },
    { key: "medicationPrescribed", labelRegex: /(medication prescribed|medications prescribed|medication:)[:\n]?/i },
  ] as const;

  const parseClinicalNote = (raw: string): ParsedNote => {
    const out: ParsedNote = { raw };
    const text = raw.replace(/\r\n/g, "\n");
    const sections: { key: string; start: number; match: RegExpExecArray | null }[] = [];
    HEADINGS.forEach((h) => {
      const re = h.labelRegex;
      re.lastIndex = 0;
      const m = re.exec(text);
      sections.push({ key: h.key, start: m ? m.index : -1, match: m });
    });

    const present = sections.filter((s) => s.start >= 0).sort((a, b) => a.start - b.start);
    if (present.length === 0) {
      out.raw = text;
      return out;
    }

    for (let i = 0; i < present.length; i++) {
      const sec = present[i];
      const next = present[i + 1];
      const startIdx = sec.match ? sec.match.index + sec.match[0].length : sec.start;
      const endIdx = next ? next.start : text.length;
      const content = text.slice(startIdx, endIdx).trim();

      switch (sec.key) {
        case "patientDetails":
          out.patientDetails = parseKeyValueSection(content);
          break;
        case "medicalHistory":
          out.medicalHistory = parseBulletList(content);
          break;
        case "problemFaced":
          out.problemFaced = looksLikeList(content) ? parseBulletList(content) : content.split(/\n+/).map((s) => s.trim()).filter(Boolean).join("\n");
          break;
        case "doctorInstructions":
          out.doctorInstructions = parseBulletList(content);
          break;
        case "medicationPrescribed":
          out.medicationPrescribed = parseMedicationSection(content);
          break;
      }
    }

    return out;
  };

  const parseKeyValueSection = (s: string): Record<string, string> => {
    const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const result: Record<string, string> = {};
    for (const line of lines) {
      const kvMatch = line.match(/^\-?\s*([^:–—-]{1,80}?)\s*[:\-–—]\s*(.+)$/);
      if (kvMatch) {
        const k = kvMatch[1].trim();
        const v = kvMatch[2].trim();
        result[normalizeKey(k)] = v;
      } else {
        if (!result["note"]) result["note"] = line;
        else result["note"] += " " + line;
      }
    }
    return result;
  };

  const normalizeKey = (k: string) => k.replace(/\s+/g, " ").trim();
  const looksLikeList = (s: string) => /^\s*[-*•\d]/m.test(s);
  const parseBulletList = (s: string): string[] => {
    const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => l.replace(/^[-*•\s]*\d*\.*\)?\s*/, "").trim()).filter(Boolean);
  };
  const parseMedicationSection = (s: string): string[] => {
    const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
  };

  // fetchNote (keeps behavior same)
  const fetchNote = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setNoteText(null);
    setParsed(null);
    aborterRef.current?.abort();
    const ctrl = new AbortController();
    aborterRef.current = ctrl;

    try {
      let presignedUrl = source;
      if (!isPresignedUrl(source)) {
        presignedUrl = await getPresignedUrlForKey(source);
      }

      const resp = await axios.get(presignedUrl, {
        responseType: "text",
        signal: ctrl.signal as any,
      });

      let rawText = normalizeText(resp.data);

      const maybeJson = (() => {
        const trimmed = rawText.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            return JSON.parse(trimmed);
          } catch {
            return null;
          }
        }
        return null;
      })();

      if (maybeJson) {
        if (typeof maybeJson === "object" && maybeJson !== null && "clinical_note" in maybeJson) {
          rawText = normalizeText(String((maybeJson as any).clinical_note ?? ""));
        } else {
          rawText = normalizeText(JSON.stringify(maybeJson, null, 2));
        }
      }

      setNoteText(rawText);

      try {
        const p = parseClinicalNote(rawText);
        setParsed(p);
      } catch {
        setParsed({ raw: rawText });
      }

      return true;
    } catch (err: any) {
      if (axios.isCancel(err)) {
        return false;
      }
      setError(err?.response?.data?.message ?? err.message ?? "Failed to fetch note");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let stopped = false;
    let totalElapsed = 0;
    let delay = 1000;

    if (!autoPoll) {
      void fetchNote();
      return () => {
        aborterRef.current?.abort();
        stopped = true;
      };
    }

    (async () => {
      while (!stopped && totalElapsed < pollTimeoutMs) {
        const ok = await fetchNote();
        if (ok && parsed) break;
        if (!ok && !error) break;
        await new Promise((res) => setTimeout(res, delay));
        totalElapsed += delay;
        delay = Math.min(delay * 2, 10000);
      }
    })();

    return () => {
      stopped = true;
      aborterRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, autoPoll]);

  // ---------------- Patient helpers ----------------
  const getEffectivePatientDetails = (): Record<string, string> => {
    const raw = (editState.parsed?.patientDetails ?? parsed?.patientDetails) ?? {};

    // console.log("Raw patient details:", raw);

    const fullNameFromRaw = (s?: string): string => {
      if (!s) return "";
      const trimmed = s.trim();
      if (trimmed.toLowerCase() === "not mentioned") return "";

      const referredMatch = trimmed.match(/referred to as\s*["']?([^"')]+)["']?/i);
      if (referredMatch && referredMatch[1]) return referredMatch[1].trim();

      const parenMatch = trimmed.match(/\(([^)]+)\)/);
      if (parenMatch && parenMatch[1]) {
        const candidate = parenMatch[1].trim();
        if (!/not mentioned/i.test(candidate)) return candidate;
      }

      return trimmed;
    };

    const fullName = fullNameFromRaw(raw.Name);

    const gender =
      raw.Gender && !raw.Gender.toLowerCase().includes("not mentioned")
        ? raw.Gender.trim()
        : "";

    let age = "";
    if (raw.Age && !raw.Age.toLowerCase().includes("not mentioned")) {
      const match = raw.Age.match(/\d+/);
      if (match) age = match[0];
    }

    let phone = "";
    if (raw["Contact Information"] && !raw["Contact Information"].toLowerCase().includes("not mentioned")) {
      const digits = raw["Contact Information"].replace(/\D/g, "");
      if (digits.length >= 8) phone = digits;
    }

    const result = { fullName, gender, age, phone };

    return result;
  };

  const showToast = (message: string, severity: "success" | "info" | "warning" | "error" = "success", _duration = 3000) => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
    // auto-close handled by SnackbarToast; keep state for explicit close handler
    // Optionally you can set a timer to auto-clear message; Snackbar closes itself
  };

  
  const extractIdentifiers = (pd: Record<string, string>) => {
    const identifiers: { email?: string; phone?: string; fullName?: string; [k: string]: string | undefined } = {};
    for (const [k, v] of Object.entries(pd)) {
      const key = k.toLowerCase();
      if (!identifiers.email && /email/.test(key)) identifiers.email = v;
      else if (!identifiers.phone && /(phone|mobile|contact|tel)/.test(key)) identifiers.phone = v.replace(/\D/g, "");
      else if (!identifiers.name && /(fullName|name|full ?name)/.test(key)) identifiers.fullName = v;
      else identifiers[k] = v; // keep additional fields for create payload
    }
    return identifiers;
  };

  // Try to find patients. Backend returns array (maybe empty) per your description.
  const findPatients = async (ident: { phone?: string; name?: string; [k: string]: any }) => {
  try {
    // wrap the payload in `extracted` to match your current backend
    const payload = ident;


    const resp = await api.post("/api/doctor/me/patients/matches/preview", payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (Array.isArray(resp.data)) {

      return resp.data as any[]; // keep the same return type you already use (Patient[])
    }


    return [];
  } catch (err) {


    return []; // silently fail as before
  }
};



  const createPatientFromDetails = async (pd: Record<string, string>) => {
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(pd)) {
      const key = k.toLowerCase().trim();
      if (/name/.test(key)) payload.fullName = v;
      else if (/email/.test(key)) payload.email = v;
      else if (/(phone|mobile|contact|tel)/.test(key)) payload.phone = v.replace(/\D/g, "");
      else if (/age/.test(key)) payload.age = isNaN(Number(v)) ? v : Number(v);
      else if (/gender/.test(key)) payload.gender = v;
      else {
        payload.meta ??= {};
        payload.meta[key] = v;
      }
    }
    if (!payload.name) payload.name = Object.values(pd).find(Boolean) ?? "Unknown";

    // console.log("payload before POST", payload)

    const resp = await api.post("/api/doctor/me/patients", payload);
    return resp.data as Patient;
  };

  // helper: convert parsed note into DB-friendly text fields
  const stringifyKV = (kv?: Record<string, string> | undefined): string => {
    if (!kv || Object.keys(kv).length === 0) return "";
    return Object.entries(kv)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  };

  const joinList = (arr?: string[] | string | undefined): string => {
    if (!arr) return "";
    if (Array.isArray(arr)) return arr.join("\n");
    return String(arr);
  };

  const handleCreateFromNoPatientDialog = async (payload: { fullName?: string; age?: string | number; phone?: string; gender?: string }) => {
  setCreatingFromNoPatientDialog(true);
  setError(null);
  try {
    // create patient on backend using your existing helper
    // the helper expects a Record<string, string> of patient details; adapt as needed
    const pdForCreate: Record<string, any> = {};
    if (payload.fullName) pdForCreate.fullName = payload.fullName;
    if (payload.age !== undefined && payload.age !== "") pdForCreate.age = isNaN(Number(payload.age)) ? payload.age : Number(payload.age);
    if (payload.phone) pdForCreate.phone = String(payload.phone).replace(/\D/g, "");
    if (payload.gender) pdForCreate.gender = payload.gender;

    // You may want to include other meta fields in pdForCreate if available
    const created = await createPatientFromDetails(pdForCreate);

    // close dialog
    setNoPatientDialogOpen(false);

    // now attach and save note to created patient (reuse confirmSaveWithPatient for consistency)
    await confirmSaveWithPatient(created);

    // optionally show toast (if you use showToast)
    if (typeof showToast === "function") showToast("Note saved and attached to newly created patient.", "success");
  } catch (err: any) {
    setError(err?.response?.data?.message ?? err.message ?? "Failed to create patient and save");
  } finally {
    setCreatingFromNoPatientDialog(false);
  }
};


  const buildClinicalNotePayload = (
    parsedContent: ParsedNote,
    sourceValue: string,
    opts?: { patientId?: string | null }
  ) => {
    const pdText = stringifyKV(parsedContent.patientDetails);
    const mhText = joinList(parsedContent.medicalHistory);
    const pfText =
      parsedContent.problemFaced && Array.isArray(parsedContent.problemFaced)
        ? joinList(parsedContent.problemFaced)
        : (parsedContent.problemFaced as string) || "";
    const diText = joinList(parsedContent.doctorInstructions);
    const mpText = joinList(parsedContent.medicationPrescribed);

    const payload: any = {
      source: sourceValue,
      raw: parsedContent.raw ?? "",
      parsed: parsedContent, // keep original parsed for convenience (optional)
      // DB fields your backend expects (text)
      patientDetails: pdText,
      medicalHistory: mhText,
      problemFaced: pfText,
      doctorInstructions: diText,
      medicationPrescribed: mpText,
    };

    if (opts?.patientId) payload.patientId = opts.patientId;

    return payload;
  };

  // Updated confirmSaveWithPatient
  const confirmSaveWithPatient = async (patient: Patient) => {
    // Called when user confirms which patient to attach the note to
    const patientId = patient.id ?? patient.patientId ?? null;

    if (!patientId) {
      setError("Selected patient has no id");
      return;
    }

    setShowMatchPicker(false);
    setSaving(true);
    setError(null);

    try {
      const rawContent = editState.raw ?? noteText ?? parsed?.raw ?? "";
      const parsedContent = editState.parsed ?? parsed ?? { raw: rawContent };

      const payload = buildClinicalNotePayload(parsedContent, source, { patientId });

      // Always create a new note
      const resp = await api.post("/api/clinical-notes", payload);

      const data = resp.data;
      const id = data._id ?? data.id ?? null;
      if (id) setSavedNoteId(id);
      if (data.raw) setNoteText(data.raw);
      if (data.parsed) setParsed(data.parsed);
      showToast("Note saved successfully.", "success");
      setEditMode(false);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

// Updated saveNote
  const saveNote = async () => {
    setSaving(true);
    setError(null);

    try {
      const rawContent = editState.raw ?? noteText ?? parsed?.raw ?? "";
      const parsedContent = editState.parsed ?? parsed ?? { raw: rawContent };

      const pd = getEffectivePatientDetails();
      // console.log("Effective patient details:", pd);

      if (pd && Object.keys(pd).length > 0) {
        const ident = extractIdentifiers(pd);

        const found = await findPatients(ident);

        if (!found || found.length === 0) {
          const pd = getEffectivePatientDetails();
          setNoPatientDialogInitial({
            fullName: pd.fullName ?? "",
            age: pd.age ?? "",
            phone: pd.phone ?? "",
            gender: pd.gender ?? "",
          });
          setNoPatientDialogOpen(true);
          return;
          
        } else {
          // multiple matches — open the picker modal and let doctor choose
          setMatchedPatients(found);
          setMatchIndex(0);
          setShowMatchPicker(true);
        }
      } else {
        // no patient details: just save as before (but still include DB fields)


        const payload = buildClinicalNotePayload(parsedContent, source);

        console.log("Saving clinical note (no patient details) payload:", payload);

        const resp = await api.post("/api/clinical-notes", payload);

        const data = resp.data;
        const id = data._id ?? data.id ?? null;
        if (id) setSavedNoteId(id);
        if (data.raw) setNoteText(data.raw);
        if (data.parsed) setParsed(data.parsed);
        setEditMode(false);

      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? "Failed to save note");
    } finally {
      setSaving(false);
    }
  };





  const applyChanges = () => {
    const rawContent = editState.raw ?? noteText ?? parsed?.raw ?? "";
    const parsedContent = editState.parsed ?? parsed ?? { raw: rawContent };

    // Commit into main state so UI outside of edit controls updates immediately
    setParsed(parsedContent);
    // Keep raw consistent if available
    if (parsedContent.raw) setNoteText(parsedContent.raw);
    else setNoteText(rawContent);
    // keep editMode on — user can continue editing

    showToast("Changes applied successfully.", "success");
  };

  // New: Reset local edits by re-fetching the note from AWS (uses your fetchNote)



  // Download / Copy helpers (kept minimal)
  const handleDownload = () => {
    if (!noteText) return;
    const blob = new Blob([noteText], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `clinical_note_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const handleCopy = async () => {
    if (!noteText) return;
    await navigator.clipboard.writeText(noteText);
  };

  const handleConfirmReset = async () => {
    setConfirmResetOpen(false);
    setResetting(true);
    try {
      await fetchNote();
      showToast("Changes reverted to fetched note.", "info");
    } catch (err: any) {
      setError(err?.message ?? "Failed to reset");
      showToast("Failed to reset changes.", "error");
    } finally {
      setResetting(false);
    }
  };

  // helpers for editing parsed fields
  const setParsedField = (updater: (p: ParsedNote | undefined) => ParsedNote | undefined) => {
    setEditState((s) => ({ ...s, parsed: updater(s.parsed ?? parsed ?? { raw: "" }) }));
  };

  // helper: pick first available key from patient record, fall back to "Not mentioned"
  const pickPatientField = (patient: Record<string, any> | undefined, keys: string[]) => {
    if (!patient) return "Not mentioned";
    for (const k of keys) {
      const v = patient[k];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== "") return s;
      }
    }
    return "Not mentioned";
  };

  // optional: normalize phone (remove weird chars) but preserve if not present
  const formatPhone = (raw?: string) => {
    if (!raw) return "Not mentioned";
    const s = String(raw).trim();
    if (!s) return "Not mentioned";
    // keep international +, digits, spaces, hyphens for readability
    const cleaned = s.replace(/[^\d+() \-]/g, "");
    return cleaned || "Not mentioned";
  };


  const renderKV = (kv?: Record<string, string>) => {
    if (!kv || Object.keys(kv).length === 0)
      return <Typography variant="body2" color="textSecondary">—</Typography>;

    return (
      <List dense>
        {Object.entries(kv).map(([k, v]) => (
          <ListItem key={k} className="py-0">
            <ListItemText
              primary={<span className="font-medium text-sm text-slate-700">{k}</span>}
              secondary={<span className="text-sm text-slate-800 whitespace-pre-wrap">{v}</span>}
            />
          </ListItem>
        ))}
      </List>
    );
  };

  const renderKVEditable = (kv?: Record<string, string>) => {
    const kvState = editState.parsed?.patientDetails ?? kv ?? {};
    const entries = Object.entries(kvState);
    return (
      <Box>
        {entries.length === 0 && (
          <Typography variant="body2" color="textSecondary">No patient details — add one below</Typography>
        )}
        <Box className="flex flex-col gap-2">
          {entries.map(([k, v], idx) => (
            <Box key={k + idx} className="flex gap-2 items-start">
              <TextField
                size="small"
                label="Key"
                value={k}
                onChange={(e) => {
                  const newKey = e.target.value;
                  setParsedField((cur) => {
                    const pd = { ...(cur?.patientDetails ?? {}) };
                    // rename key
                    delete pd[k];
                    pd[newKey] = v;
                    return { ...(cur ?? {}), patientDetails: pd };
                  });
                }}
              />
              <TextField
                size="small"
                label="Value"
                value={v}
                fullWidth
                onChange={(e) => {
                  const newVal = e.target.value;
                  setParsedField((cur) => {
                    const pd = { ...(cur?.patientDetails ?? {}) };
                    pd[k] = newVal;
                    return { ...(cur ?? {}), patientDetails: pd };
                  });
                }}
              />
              <Button
                size="small"
                onClick={() =>
                  setParsedField((cur) => {
                    const pd = { ...(cur?.patientDetails ?? {}) };
                    delete pd[k];
                    return { ...(cur ?? {}), patientDetails: pd };
                  })
                }
              >
                Remove
              </Button>
            </Box>
          ))}

          <Button
            size="small"
            onClick={() =>
              setParsedField((cur) => {
                const pd = { ...(cur?.patientDetails ?? {}) };
                let i = 1;
                let candidate = "new_key";
                while (pd[candidate]) {
                  candidate = `new_key_${i++}`;
                }
                pd[candidate] = "";
                return { ...(cur ?? {}), patientDetails: pd };
              })
            }
          >
            Add field
          </Button>
        </Box>
      </Box>
    );
  };

  const renderList = (items?: string[]) => {
    if (!items || items.length === 0)
      return <Typography variant="body2" color="textSecondary">—</Typography>;

    return (
      <List dense>
        {items.map((it, i) => (
          <ListItem key={i} className="py-0.5">
            <ListItemText primary={<Typography variant="body2" className="whitespace-pre-wrap">{it}</Typography>} />
          </ListItem>
        ))}
      </List>
    );
  };

  const renderListEditable = (list: string[] | undefined, keyName: keyof ParsedNote) => {
    const arr = editState.parsed?.[keyName as keyof ParsedNote] as string[] | undefined ?? (list ?? []);
    return (
      <Box className="flex flex-col gap-2">
        {arr.map((it, i) => (
          <Box key={i} className="flex gap-2 items-start">
            <TextField
              size="small"
              value={it}
              fullWidth
              onChange={(e) =>
                setParsedField((cur) => {
                  const copy = { ...(cur ?? {}) } as ParsedNote;
                  const curArr = [...(copy[keyName as keyof ParsedNote] as string[] | undefined ?? arr)];
                  curArr[i] = e.target.value;
                  (copy as any)[keyName] = curArr;
                  return copy;
                })
              }
            />
            <Button
              size="small"
              onClick={() =>
                setParsedField((cur) => {
                  const copy = { ...(cur ?? {}) } as ParsedNote;
                  const curArr = [...(copy[keyName as keyof ParsedNote] as string[] | undefined ?? arr)];
                  curArr.splice(i, 1);
                  (copy as any)[keyName] = curArr;
                  return copy;
                })
              }
            >
              Remove
            </Button>
          </Box>
        ))}
        <Button
          size="small"
          onClick={() =>
            setParsedField((cur) => {
              const copy = { ...(cur ?? {}) } as ParsedNote;
              const curArr = [...(copy[keyName as keyof ParsedNote] as string[] | undefined ?? arr), ""];
              (copy as any)[keyName] = curArr;
              return copy;
            })
          }
        >
          Add
        </Button>
      </Box>
    );
  };

  // ---------------- RENDER ----------------
  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col">
      <Card className={`${className ?? "w-full mx-auto my-0"} shadow-none border-none`}>
        <CardContent className="flex flex-col p-6">
          {/* Header (centered at top) */}
          <header className="flex-shrink-0">
            <Typography variant="h5" align="center" className="font-semibold">
              Clinical Note
            </Typography>
          </header>

          {/* Main content: stretches and scrolls */}
          <main className="flex-grow mt-4">
            {/* 2 equal columns on md+ screens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[600px]">
              {/* Left column */}
              <div className="space-y-6">
                {/* Patient Details */}
                <div className="rounded-lg border p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <Typography variant="subtitle2" className="text-slate-700">
                      Patient Details
                    </Typography>
                  </div>
                  <Divider className="my-2" />
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <CircularProgress size={18} />
                      <Typography variant="body2">Loading…</Typography>
                    </div>
                  ) : editMode ? (
                    renderKVEditable(parsed?.patientDetails)
                  ) : (
                    renderKV(parsed?.patientDetails)
                  )}
                </div>

                {/* Medical History */}
                <div className="rounded-lg border p-4 bg-white">
                  <Typography variant="subtitle2" className="text-slate-700">
                    Medical History
                  </Typography>
                  <Divider className="my-2" />
                  {loading ? (
                    <Typography variant="body2">Loading…</Typography>
                  ) : editMode ? (
                    renderListEditable(parsed?.medicalHistory, "medicalHistory")
                  ) : (
                    renderList(parsed?.medicalHistory)
                  )}
                </div>

               {/* Problem Faced */}
                <div className="rounded-lg border p-4 bg-white">
                  <Typography variant="subtitle2" className="text-slate-700">
                    Problem Faced
                  </Typography>
                  <Divider className="my-2" />
                  {loading ? (
                    <Typography variant="body2">Loading…</Typography>
                  ) : editMode ? (
                    renderListEditable(parsed?.problemFaced as string[] | undefined, "problemFaced")
                  ) : (
                    // problemFaced can be string or array — normalize for display:
                    Array.isArray(parsed?.problemFaced)
                      ? renderList(parsed?.problemFaced as string[])
                      : renderList(typeof parsed?.problemFaced === "string" ? (parsed?.problemFaced as string).split("\n").filter(Boolean) : [])
                  )}
                </div>


              </div>

              {/* Right column */}
              <div className="space-y-6">
                <div className="rounded-lg border p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <Typography variant="subtitle2" className="text-slate-700">
                      Doctor Instructions
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        parsed?.doctorInstructions?.length
                          ? `${parsed?.doctorInstructions.length}`
                          : "—"
                      }
                    />
                  </div>
                  <Divider className="my-2" />
                  {loading ? (
                    <Typography variant="body2">Loading…</Typography>
                  ) : editMode ? (
                    renderListEditable(parsed?.doctorInstructions, "doctorInstructions")
                  ) : (
                    renderList(parsed?.doctorInstructions)
                  )}
                </div>

                <div className="rounded-lg border p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <Typography variant="subtitle2" className="text-slate-700">
                      Medication Prescribed
                    </Typography>
                    <Chip
                      size="small"
                      label={
                        parsed?.medicationPrescribed?.length
                          ? `${parsed?.medicationPrescribed.length}`
                          : "—"
                      }
                    />
                  </div>
                  <Divider className="my-2" />
                  {loading ? (
                    <Typography variant="body2">Loading…</Typography>
                  ) : editMode ? (
                    renderListEditable(parsed?.medicationPrescribed, "medicationPrescribed")
                  ) : (
                    renderList(parsed?.medicationPrescribed)
                  )}
                </div>
              </div>
            </div>
          </main>


          {/* Footer: fixed action row at bottom (always visible) */}
          <footer className="flex-shrink-0 mt-4 pt-4 border-t -mx-6 px-6 pb-6 bg-white">
            <div className="max-w-6xl mx-auto flex items-center justify-center gap-4">
              <Button size="medium" variant={editMode ? "outlined" : "contained"} startIcon={<EditIcon />} onClick={() => setEditMode((v) => !v)}>
                {editMode ? "Exit Edit" : "Edit"}
              </Button>

              {/* Apply / Reset only visible in edit mode */}
              {editMode && (
                <>
                  <Button size="medium" variant="outlined" onClick={applyChanges} disabled={loading}>
                    Apply changes
                  </Button>

                  <Button size="medium" variant="outlined" onClick={() => setConfirmResetOpen(true)} disabled={loading}>
                    Reset
                  </Button>
                </>
              )}


              <Button size="medium" variant="contained" color="primary" startIcon={<SaveIcon />} onClick={saveNote} disabled={saving || (!editState.raw && !editState.parsed)}>
                {saving ? <CircularProgress size={18} /> : "Save"}
              </Button>

              <Button size="medium" variant="outlined" startIcon={<FileDownloadIcon />} onClick={handleDownload} disabled={!noteText}>
                Download
              </Button>

              <Button size="medium" variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={!noteText}>
                Copy
              </Button>
            </div>
          </footer>

          {/* Error */}
          {error && (
            <div className="mt-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Match picker dialog */}
      <Dialog open={showMatchPicker} onClose={() => setShowMatchPicker(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Matched Patients</DialogTitle>
        <DialogContent>
          {matchedPatients.length === 0 ? (
            <Typography>No matches</Typography>
          ) : (
            <Box className="flex flex-col gap-3">
              <Box className="flex items-start gap-2">
                <IconButton disabled={matchIndex <= 0} onClick={() => setMatchIndex((i) => Math.max(0, i - 1))}>
                  <ArrowBackIcon />
                </IconButton>

                <Box className="flex-1">
                  <Typography variant="subtitle1" className="font-medium">{matchedPatients[matchIndex].name ?? matchedPatients[matchIndex].fullName ?? matchedPatients[matchIndex].displayName ?? `Patient #${matchIndex + 1}`}</Typography>
                  {/* render patient details using same renderer (but it's a patient object) */}
                  <Box className="mt-2">
                    {(() => {
                      const p = matchedPatients[matchIndex] ?? {};
                      const displayName = pickPatientField(p, ["name", "fullName", "displayName"]);
                      const gender = pickPatientField(p, ["gender", "sex"]);
                      const phoneRaw = pickPatientField(p, ["phone", "mobile", "contact", "telephone", "tel"]);
                      const phone = phoneRaw === "Not mentioned" ? "Not mentioned" : formatPhone(phoneRaw);
                      const age = pickPatientField(p, ["age", "years"]);

                      return (
                        <List dense>
                          <ListItem className="py-0">
                            <ListItemText primary={<span className="font-medium text-sm text-slate-700">Name</span>} secondary={<span className="text-sm text-slate-800">{displayName}</span>} />
                          </ListItem>

                          <ListItem className="py-0">
                            <ListItemText primary={<span className="font-medium text-sm text-slate-700">Gender</span>} secondary={<span className="text-sm text-slate-800">{gender}</span>} />
                          </ListItem>

                          <ListItem className="py-0">
                            <ListItemText primary={<span className="font-medium text-sm text-slate-700">Phone</span>} secondary={<span className="text-sm text-slate-800">{phone}</span>} />
                          </ListItem>

                          <ListItem className="py-0">
                            <ListItemText primary={<span className="font-medium text-sm text-slate-700">Age</span>} secondary={<span className="text-sm text-slate-800">{age}</span>} />
                          </ListItem>
                        </List>
                      );
                    })()}
                    </Box>

                </Box>
                <IconButton disabled={matchIndex >= matchedPatients.length - 1} onClick={() => setMatchIndex((i) => Math.min(matchedPatients.length - 1, i + 1))}>
                  <ArrowForwardIcon />
                </IconButton>
              </Box>

              <Typography variant="body2" color="textSecondary">Use the arrows to browse matches. Click "Use & Save" to attach the note to the selected patient. Or create a new patient from the note details.</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMatchPicker(false)}>Cancel</Button>
          <Button onClick={async () => {
            // create new patient from parsed details and save
            try {
              setCreatingPatient(true);
              const pd = getEffectivePatientDetails();
              const created = await createPatientFromDetails(pd);
              await confirmSaveWithPatient(created);
            } catch (err: any) {
              setError(err?.response?.data?.message ?? err.message ?? 'Failed to create patient');
            } finally {
              setCreatingPatient(false);
            }
          }} disabled={creatingPatient}>Create new & Save</Button>

          <Button onClick={() => matchedPatients[matchIndex] && confirmSaveWithPatient(matchedPatients[matchIndex])} variant="contained" color="primary" disabled={matchedPatients.length === 0}>
            Use & Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Reset dialog */}
    <ConfirmDialog
      open={confirmResetOpen}
      title="Reset changes?"
      description="This will discard all local edits and re-fetch the note from AWS. Are you sure?"
      confirmLabel="Reset"
      cancelLabel="Cancel"
      onConfirm={handleConfirmReset}
      onCancel={() => setConfirmResetOpen(false)}
      loading={resetting}
    />

    {/* Toast */}
    <SnackbarToast
      open={toastOpen}
      onClose={() => setToastOpen(false)}
      message={toastMessage}
      severity={toastSeverity}
    />

    <NoPatientFoundDialog
      open={noPatientDialogOpen}
      initial={noPatientDialogInitial ?? undefined}
      onCancel={() => setNoPatientDialogOpen(false)}
      onCreateAndSave={handleCreateFromNoPatientDialog}
      loading={creatingFromNoPatientDialog}
      title="No patient found"
      description="No existing patient matched the extracted details. Edit these details to create a new patient and attach the note."
    />


    </div>
  );
}
