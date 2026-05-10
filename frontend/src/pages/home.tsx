// pages/HomePage.tsx
import  { useState } from "react";
import ResponsiveAppBar from "../components/navbar.tsx";
import AudioRecorder from "../components/transcribeBar.tsx";
import ClinicalNoteViewer from "../components/ClinicalNoteViewer.tsx";

export default function HomePage() {
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [isNoteReady, setIsNoteReady] = useState(false);

  // Handle note ID generation from AudioRecorder
  const handleNoteIdGenerated = (noteId: string) => {
    console.log("🆔 Note ID generated:", noteId);
    setCurrentNoteId(noteId);
    setIsGeneratingNote(true);
    setIsNoteReady(false);
  };

  // Handle session start from AudioRecorder
  const handleSessionStart = (sessionId: string) => {
    console.log("Session started:", sessionId);
  };

  // Handle session end from AudioRecorder
  const handleSessionEnd = () => {
    console.log("Session ended");
  };

  // Handle note saved callback
  const handleNoteSaved = () => {
    console.log("Note saved successfully");
    setIsNoteReady(true);
    setIsGeneratingNote(false);
  };

  // Handle note discarded callback
  const handleNoteDiscarded = () => {
    console.log("Note discarded");
    setCurrentNoteId(null);
    setIsNoteReady(false);
    setIsGeneratingNote(false);
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
              Record an audio note using the bar below. The clinical note will appear
              in real-time as you speak.
            </p>
          </div>

          {/* Clinical Note Display - using new Supabase flow */}
          {currentNoteId && (
            <div className="px-4 md:px-8 max-w-3xl mx-auto">
              <ClinicalNoteViewer
                noteId={currentNoteId}
                className="w-full"
                onNoteSaved={handleNoteSaved}
                onNoteDiscarded={handleNoteDiscarded}
              />
            </div>
          )}
        </div>
      </main>

      {/* Fixed Audio Recorder Bar */}
      <AudioRecorder
        isGeneratingNote={isGeneratingNote}
        isNoteReady={isNoteReady}
        onSessionStart={handleSessionStart}
        onSessionEnd={handleSessionEnd}
        onNoteSaved={handleNoteSaved}
        onNoteIdGenerated={handleNoteIdGenerated}
      />
    </div>
  );
}
