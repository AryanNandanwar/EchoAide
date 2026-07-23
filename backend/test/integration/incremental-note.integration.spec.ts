import { IncrementalNoteService } from '../../src/modules/streaming/incremental-note.service';

describe('IncrementalNoteService integration', () => {
  let service: IncrementalNoteService;

  beforeEach(() => {
    service = new IncrementalNoteService();
  });

  it('generates a structured note from Bedrock JSON without calling AWS', async () => {
    const bedrockResponse = JSON.stringify({
      patientDetails: { name: 'Asha Rao', age: '41', gender: 'Female' },
      medicalHistory: ['Diabetes'],
      problemFaced: 'Headache and dizziness',
      findings: ['BP elevated'],
      diagnosis: ['Hypertension'],
      investigationsAdvised: ['CBC'],
      doctorInstructions: ['Follow up in 1 week'],
      medicationPrescribed: ['Amlodipine 5mg'],
    });

    jest.spyOn(service as any, 'callBedrock').mockResolvedValue(bedrockResponse);

    const note = await service.generateFinalNote(
      'Patient reports headache and dizziness. Blood pressure is elevated today.',
    );

    expect(note.patientDetails).toMatchObject({ name: 'Asha Rao', age: '41' });
    expect(note.medicalHistory).toEqual(['Diabetes']);
    expect(note.problemFaced).toBe('Headache and dizziness');
    expect(note.diagnosis).toEqual(['Hypertension']);
    expect((service as any).callBedrock).toHaveBeenCalledTimes(1);
  });

  it('returns default structure when Bedrock call fails', async () => {
    jest.spyOn(service as any, 'callBedrock').mockRejectedValue(new Error('Throttled'));

    const note = await service.generateFinalNote(
      'Patient reports headache and dizziness for two days with elevated blood pressure.',
    );

    expect(note.problemFaced).toBe('Not mentioned');
    expect(note.medicalHistory).toEqual(['Not mentioned']);
  });
});
