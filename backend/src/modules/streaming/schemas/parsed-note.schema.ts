import { z } from 'zod';

// Define medication object schema
const MedicationSchema = z.object({
  name: z.string().optional(),
  dosage: z.string().optional(),
  duration: z.string().optional(),
  purpose: z.string().optional(),
  instructions: z.string().optional(),
  description: z.string().optional(),
  note: z.string().optional(),
});

export const ParsedNoteSchema = z.object({
  patientDetails: z.record(z.string(), z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  problemFaced: z.union([z.string(), z.array(z.string())]).optional(),
  findings: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  diagnosis: z.array(z.string()).optional(),
  investigationsAdvised: z.array(z.string()).optional(),
  doctorInstructions: z.array(z.string()).optional(),
  medicationPrescribed: z.array(z.union([z.string(), MedicationSchema])).optional(),
  raw: z.string().optional(),
});

export type ParsedNote = z.infer<typeof ParsedNoteSchema>;