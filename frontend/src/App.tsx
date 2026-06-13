// src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./pages/home";
import Login from "./pages/Login";
// import Register from "./pages/Register";
import PatientsPage from "./pages/Patients";
import NotesPage from "./pages/Notes";
import ReceptionistIntakePage from "./pages/ReceptionistIntake";
import DoctorLayout from "./layouts/DoctorLayout";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DoctorLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/notes" element={<NotesPage />} />
        </Route>

        {/* login & register */}
        <Route path="/login" element={<Login />} />
        <Route path="/receptionist/intake" element={<ReceptionistIntakePage />} />

        {/* example: redirect unknown paths to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
