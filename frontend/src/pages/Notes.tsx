import { useEffect, useState, useMemo } from "react";
import api from "../lib/api";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  TextField,
  InputAdornment,
  MenuItem,
} from "@mui/material"; // Added MenuItem
import SearchIcon from "@mui/icons-material/Search";
import ResponsiveAppBar from "../components/navbar";

type ClinicalNote = {
  id: string;
  createdAt: string;
  patient: {
    fullName: string;
  };
  medicalHistory: string;
  problemsFaced: string;
  doctorInstructions: string;
  medicationPrescribed: string;
};

const parseText = (v: string) => {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.join(", ") : parsed;
  } catch {
    return v;
  }
};

export default function NotesPage() {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Filter, and Sort State
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "earliest">("latest");

  useEffect(() => {
    api.get("/api/clinical-notes")
      .then((res) => setNotes(res.data))
      .finally(() => setLoading(false));
  }, []);

  // Filter AND Sort Logic
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        // 1. Search Filter
        const searchLower = search.toLowerCase();
        const matchesSearch =
          search === "" ||
          n.patient.fullName.toLowerCase().includes(searchLower) ||
          n.medicalHistory.toLowerCase().includes(searchLower) ||
          n.problemsFaced.toLowerCase().includes(searchLower) ||
          n.doctorInstructions.toLowerCase().includes(searchLower) ||
          n.medicationPrescribed.toLowerCase().includes(searchLower);

        // 2. Date Filter
        const noteDate = new Date(n.createdAt).toISOString().split("T")[0];
        const matchesDate = selectedDate === "" || noteDate === selectedDate;

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        // 3. Sorting Logic
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "latest" ? dateB - dateA : dateA - dateB;
      });
  }, [notes, search, selectedDate, sortOrder]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[70vh]">
        <CircularProgress />
      </div>
    );
  }

  return (
    <>
      <ResponsiveAppBar />

      <div className="pt-20 min-h-screen bg-slate-50 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <Typography variant="h5" className="font-semibold text-slate-800">
              Clinical Notes
            </Typography>

            {/* Controls Container */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              {/* Search Input */}
              <TextField
                placeholder="Search..."
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white"
                sx={{ minWidth: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon className="text-slate-400" />
                    </InputAdornment>
                  ),
                }}
              />

              {/* Date Filter */}
              <TextField
                type="date"
                size="small"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white"
                sx={{ minWidth: 150 }}
              />

              {/* Sort Dropdown */}
              <TextField
                select
                size="small"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as "latest" | "earliest")
                }
                className="bg-white"
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="latest">Latest First</MenuItem>
                <MenuItem value="earliest">Oldest First</MenuItem>
              </TextField>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 gap-6">
            {filteredNotes.map((n) => (
              <Card
                key={n.id}
                className="
                    rounded-3xl 
                    border border-slate-200 
                    bg-white 
                    shadow-sm 
                    hover:shadow-md 
                    transition 
                    overflow-hidden
                "
              >
                <div className="bg-gradient-to-r from-indigo-50 to-cyan-50 px-6 py-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <Typography className="font-semibold text-lg text-slate-800">
                        {n.patient.fullName}
                      </Typography>
                      <Typography variant="caption" className="text-slate-500">
                        Clinical Visit
                      </Typography>
                    </div>

                    <Chip
                      label={new Date(n.createdAt).toLocaleDateString()}
                      size="small"
                      className="bg-indigo-100 text-indigo-700"
                    />
                  </div>
                </div>

                <CardContent className="space-y-5 px-6 py-5">
                  <MedicalBlock title="Medical History" value={n.medicalHistory} />
                  <MedicalBlock title="Problems Faced" value={n.problemsFaced} />
                  <MedicalBlock
                    title="Doctor Instructions"
                    value={n.doctorInstructions}
                  />
                  <MedicalBlock
                    title="Medication Prescribed"
                    value={n.medicationPrescribed}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredNotes.length === 0 && (
            <div className="text-center text-slate-500 mt-20">
              No notes match your filters
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MedicalBlock({ title, value }: { title: string; value: string }) {
  const parsed = parseText(value);

  return (
    <div className="rounded-xl bg-slate-50 border px-4 py-3">
      <Typography className="text-xs uppercase tracking-wide text-indigo-600 font-semibold mb-1">
        {title}
      </Typography>

      <Typography className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">
        {parsed}
      </Typography>
    </div>
  );
}
