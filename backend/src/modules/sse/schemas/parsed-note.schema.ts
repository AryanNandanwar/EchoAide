import { z } from 'zod';

export const ParsedNoteSchema = z.object({
  patientDetails: z.record(z.string(), z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  problemFaced: z.union([z.string(), z.array(z.string())]).optional(),
  findings: z.array(z.string()).optional(),
  diagnosis: z.array(z.string()).optional(),
  investigationsAdvised: z.array(z.string()).optional(),
  doctorInstructions: z.array(z.string()).optional(),
  medicationPrescribed: z.array(z.string()).optional(),
  raw: z.string().optional(),
});

export type ParsedNote = z.infer<typeof ParsedNoteSchema>;
