import { ParsedNoteSchema } from './parsed-note.schema';

describe('ParsedNoteSchema', () => {
  it('accepts a fully populated structured note', () => {
    const note = {
      patientDetails: { name: 'Asha Rao', age: '41' },
      medicalHistory: ['Diabetes'],
      problemFaced: 'Headache',
      findings: ['BP elevated'],
      diagnosis: ['Hypertension'],
      investigationsAdvised: ['CBC'],
      doctorInstructions: ['Follow up in 1 week'],
      medicationPrescribed: ['Amlodipine 5mg'],
    };

    expect(ParsedNoteSchema.safeParse(note).success).toBe(true);
  });

  it('accepts problemFaced as a string array', () => {
    const result = ParsedNoteSchema.safeParse({
      problemFaced: ['Headache', 'Dizziness'],
    });

    expect(result.success).toBe(true);
  });

  it('accepts medication objects from the model', () => {
    const result = ParsedNoteSchema.safeParse({
      medicationPrescribed: [
        {
          name: 'Amlodipine',
          dosage: '5mg',
          duration: '30 days',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid patient detail value types', () => {
    const result = ParsedNoteSchema.safeParse({
      patientDetails: { age: 41 },
    });

    expect(result.success).toBe(false);
  });
});
