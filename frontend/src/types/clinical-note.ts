export type ParsedNote = {
  patientDetails?: Record<string, string>;
  medicalHistory?: string[];
  problemFaced?: string | string[];
  findings?: string[];
  diagnosis?: string[];
  investigationsAdvised?: string[];
  doctorInstructions?: string[];
  medicationPrescribed?: string[];
  raw?: string;
};
