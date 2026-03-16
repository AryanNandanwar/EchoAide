import axios from "axios";
import fs from "node:fs/promises";
import path from "node:path";

const {
  AUDIO_FILE,
  PRESIGN_BASE_URL,
  NOTE_PRESIGN_BASE_URL,
  POLL_TIMEOUT_MS = "300000",
  POLL_INTERVAL_MS = "3000",
} = process.env;

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getUploadPresignedUrl(filename) {
  const base = required("PRESIGN_BASE_URL", PRESIGN_BASE_URL);
  const url = `${base}/PreSign?filename=${encodeURIComponent(filename)}`;
  const response = await axios.get(url);
  return typeof response.data === "string" ? response.data : response.data.url;
}

async function getNotePresignedUrl(key) {
  const base = required("NOTE_PRESIGN_BASE_URL", NOTE_PRESIGN_BASE_URL);
  const response = await axios.get(`${base}?key=${encodeURIComponent(key)}`);
  return typeof response.data === "string" ? response.data : response.data.url;
}

function getExtension(filePath, contentType) {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  if (ext) return ext;

  const lower = (contentType || "").toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("flac")) return "flac";
  if (lower.includes("ogg")) return "ogg";
  return "wav";
}

async function main() {
  const filePath = required("AUDIO_FILE", AUDIO_FILE);
  const content = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);

  if (stat.size === 0) {
    throw new Error(`Audio file is empty: ${filePath}`);
  }

  const mime =
    path.extname(filePath).toLowerCase() === ".wav"
      ? "audio/wav"
      : path.extname(filePath).toLowerCase() === ".mp3"
        ? "audio/mpeg"
        : "application/octet-stream";

  const extension = getExtension(filePath, mime);
  const baseName = `audio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const uploadFilename = `${baseName}.${extension}`;

  console.log(`Uploading ${filePath} (${stat.size} bytes) as ${uploadFilename}`);

  const uploadUrl = await getUploadPresignedUrl(uploadFilename);
  await axios.put(uploadUrl, content, {
    headers: {
      "Content-Type": mime,
      "Content-Length": stat.size,
    },
    maxBodyLength: Infinity,
  });

  const noteKey = `clinical_notes/${baseName}.txt`;
  const noteUrl = await getNotePresignedUrl(noteKey);

  const timeoutMs = Number(POLL_TIMEOUT_MS);
  const intervalMs = Number(POLL_INTERVAL_MS);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await axios.get(noteUrl, {
        headers: { Range: "bytes=0-2048" },
        responseType: "text",
      });

      if (response.status >= 200 && response.status < 300) {
        console.log("✅ Note generation completed.");
        console.log(`Note key: ${noteKey}`);
        return;
      }
    } catch (error) {
      const status = error?.response?.status;
      if (status !== 403 && status !== 404) {
        console.warn(`Unexpected poll status: ${status}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for generated note for key: ${noteKey}`);
}

main().catch((error) => {
  console.error("❌ Audio pipeline smoke test failed:", error.message);
  process.exit(1);
});