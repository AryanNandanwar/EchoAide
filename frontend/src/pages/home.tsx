// pages/HomePage.tsx
import  { useState } from "react";
import ResponsiveAppBar from "../components/navbar.tsx";
import AudioRecorder from "../components/transcribeBar.tsx";
import ClinicalNoteViewer from "../components/ClinicalNoteViewer.tsx";
import { useSseTranscription } from "../hooks/use-sse-transcription";
import { type ParsedNote } from "../types/clinical-note";

export default function HomePage() {
  const [clinicalNote, setClinicalNote] = useState<ParsedNote>({});
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [isNoteReady, setIsNoteReady] = useState(false);

  // SSE hook for final note updates
  const { connect, disconnect } = useSseTranscription({
    baseUrl: 'http://localhost:3000',
    onNoteUpdate: (note) => {
      console.log("Final note received via SSE:", note);
      setClinicalNote(note);
      if (Object.keys(note).length > 0) {
        setIsGeneratingNote(false);
        setIsNoteReady(true);
        // Disconnect SSE immediately after receiving the final note
        console.log("Final note received, disconnecting SSE");
        disconnect();
      }
    },
    onError: (error) => {
      console.error("SSE error:", error);
    }
  });

  // Handle real-time transcript updates from AudioRecorder
  // const handleTranscriptUpdate = (newTranscript: string) => {
  //   setTranscript(newTranscript);
  // };

  // Handle session start from AudioRecorder
  const handleSessionStart = (sessionId: string) => {
    console.log("Session started, connecting SSE:", sessionId);
    connect(sessionId);
  };

  // Handle session end from AudioRecorder
  const handleSessionEnd = () => {
    console.log("Session ended, waiting for final note before disconnecting SSE");
    // Wait 10 seconds before disconnecting to allow final note to be received
    setTimeout(() => {
      console.log("Disconnecting SSE after timeout");
      disconnect();
    }, 10000);
  };

  // Handle final clinical note from AudioRecorder (fallback)
  // const handleNoteUpdate = (note: Record<string, string>) => {
  //   console.log("Final note received in home page (fallback):", note);
  //   setClinicalNote(note);
  //   if (Object.keys(note).length > 0) {
  //     setIsGeneratingNote(false);
  //     setIsNoteReady(true);
  //   }
  // };

  const handleNoteSaved = () => {
    setIsNoteReady(false);
    setClinicalNote({});
  };

  const handleNoteDiscarded = () => {
    setIsNoteReady(false);
    setClinicalNote({});
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

          
          {/* {transcript && (
            <div className="mb-6 px-4 md:px-8 max-w-3xl mx-auto">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">Live Transcript</h3>
                <p className="text-blue-700">{transcript}</p>
              </div>
            </div>
          )} */}

          {/* Clinical Note Display */}
          {Object.keys(clinicalNote).length > 0 && (
            <div className="px-4 md:px-8 max-w-3xl mx-auto">
              <ClinicalNoteViewer
                source={clinicalNote}
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
      />
    </div>
  );
}
