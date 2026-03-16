// pages/HomePage.tsx
import  { useState } from "react";
import ResponsiveAppBar from "../components/navbar.tsx";
import AudioRecorder from "../components/transcribeBar.tsx";
import ClinicalNoteViewer from "../components/ClinicalNoteViewer.tsx";
import axios from "axios";

/**
 * Helper: ask your presign-get endpoint for a presigned GET for a given key.
 * Returns the presigned URL string or null on failure.
 */
async function tryGetPresignedForKey(key: string, apiBase: string): Promise<string | null> {
  try {
    const resp = await axios.get(`${apiBase}?key=${encodeURIComponent(key)}`);
    const data = resp.data;
    if (!data) return null;
    if (typeof data === "string") return data;
    if (data.url) return data.url;
    return null;
  } catch (err: any) {
    // If key not found or access denied, just return null so we can try the next one
    return null;
  }
}

/**
 * Helper: Polls a specific pre-signed URL until it returns 200 OK or timeout.
 * Returns true if file is ready, false if timed out.
 */
async function pollPresignedUrl(url: string, timeoutMs: number, intervalMs: number) {
  const endAt = Date.now() + timeoutMs;

  while (Date.now() < endAt) {
    try {
      await axios.get(url, {
        headers: { Range: "bytes=0-0" }, // tiny download
        responseType: "text",
      });

      return true; // object is readable now
    } catch (err: any) {
      const status = err.response?.status;
      
      const body = String(err.response?.data ?? "");
      console.log("Polling... status:", status);

      // Missing object can be 403 or 404 depending on permissions/settings. 
      if (status === 403 || status === 404) {
        console.log("File not ready yet, continuing to poll...");
        // keep waiting
      } else {
        console.warn("Unexpected polling error:", status, body);
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}



/**
 * Resolve the note by guessing its name and polling that specific URL.
 */
async function resolveOutputNote({
  apiBase,
  filename,
  timeoutMs = 300000, // 5 minutes default
  intervalMs = 3000,
}: {
  apiBase: string;
  filename: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ key: string; url: string } | null> {
  const base = filename.replace(/\.[^/.]+$/, ""); // "audio-1730..."

  // 1️⃣ Define the single MOST likely output path
  // Ensure your backend saves exactly to this path
  const targetKey = `clinical_notes/${base}.txt`; 

  // 2️⃣ Get the pre-signed URL immediately (even if file doesn't exist yet)
  const url = await tryGetPresignedForKey(targetKey, apiBase);
  
  if (!url) {
    console.error("Failed to generate presigned URL");
    return null;
  }

  // 3️⃣ Poll that URL until the file appears
  console.log(`Polling for note at: ${targetKey}...`);
  const isReady = await pollPresignedUrl(url, timeoutMs, intervalMs);

  if (isReady) {
    console.log("Note found!");
    return { key: targetKey, url };
  } else {
    console.warn("Timed out waiting for note generation.");
    return null;
  }
}



export default function HomePage() {
  const [noteSource, setNoteSource] = useState<string | null>(null);

  /** Your API Gateway base (no trailing slash) */
  const API_BASE = import.meta.env.VITE_API_GATEWAY_BASE_URL

  /** PreSign endpoint to upload audio to S3 */
  const fetchPresignedUrl = async (filename: string): Promise<string> => {
    const base = import.meta.env.VITE_AWS_PRESIGN_S3_URL
    const url = `${base}/PreSign?filename=${encodeURIComponent(filename)}`;
    const response = await axios.get(url);
    return typeof response.data === "string" ? response.data : response.data.url;
  };

  

  /**
   * Triggered when AudioRecorder successfully uploads a file.
   * We derive its corresponding clinical note and show it in ClinicalNoteViewer.
   */
  const handleUploadComplete = async (s3AudioUrl: string) => {
    let filename = "";
    try {
      const u = new URL(s3AudioUrl);
      const path = u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;
      filename = path.split("/").pop() ?? "";
    } catch {
      filename = s3AudioUrl.split("/").pop() ?? s3AudioUrl;
    }

    if (!filename) {
      console.error("Could not determine uploaded audio filename");
      return;
    }

    setNoteSource(null); // reset viewer while resolving

    try {
      const resolved = await resolveOutputNote({
        apiBase: API_BASE,
        filename,
        timeoutMs: 10 * 60 * 1000, // 5 minutes
        intervalMs: 200000,  // 2s initial poll
      });



      console.log("Resolved processed note:", resolved);

      if (!resolved) {
        console.warn("No processed note found for", filename);
        return;
      }

      // Use presigned GET URL directly — ClinicalNoteViewer will display contents
      //If using key, set noteSource to resolved.key instead
      //If using URL, set noteSource to resolved.url
      setNoteSource(resolved.key);
      console.log("Displaying note from key:", noteSource);
    } catch (err) {
      console.error("Error resolving processed note:", err);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Top Navbar */}
      <ResponsiveAppBar />

      {/* Main Content */}
      <main className="pt-20 pb-32 bg-gray-50 min-h-screen flex flex-col">
        {/* Centered content wrapper */}
        <div className="flex-1 w-full">
          {/* Header text - centered */}
          <div className="mb-6 px-4 md:px-8 max-w-3xl mx-auto text-center">
            <h1 className="text-3xl font-bold">Welcome</h1>
            <p className="text-gray-700">
              Record an audio note using the bar below. Once processed, the
              generated clinical note will appear.
            </p>
          </div>

          {noteSource ? (
            <ClinicalNoteViewer
              source={noteSource}
              presignEndpoint={API_BASE}
              autoPoll={false}
              className="w-full h-full mt-6"
            />
          ) : (
            <div className="mt-6 text-sm text-gray-500 max-w-3xl mx-auto text-left px-4 md:px-8">

            </div>
          )}
        </div>
      </main>

      {/* Fixed Audio Recorder Bar */}
      <AudioRecorder
        getPresignedUrl={fetchPresignedUrl}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}
