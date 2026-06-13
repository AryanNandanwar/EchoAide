import { Outlet } from "react-router-dom";
import ResponsiveAppBar from "../components/navbar";
import PendingClinicalNotePanel from "../components/PendingClinicalNotePanel";
import { PendingClinicalNoteProvider } from "../context/pending-clinical-note-context";

export default function DoctorLayout() {
  return (
    <PendingClinicalNoteProvider>
      <div className="min-h-screen bg-gray-50">
        <ResponsiveAppBar />
        <div className="pt-16">
          <PendingClinicalNotePanel />
          <Outlet />
        </div>
      </div>
    </PendingClinicalNoteProvider>
  );
}
