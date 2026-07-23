import { IncrementalNoteService } from './incremental-note.service';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const mockBedrockSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockBedrockSend,
  })),
  InvokeModelCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

describe('IncrementalNoteService', () => {
  let service: IncrementalNoteService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBedrockSend.mockReset();
    process.env.BEDROCK_MAX_RETRIES = '3';
    process.env.BEDROCK_BASE_DELAY = '100';
    process.env.BEDROCK_MAX_DELAY = '500';
    delete process.env.BEDROCK_MODEL_ID;
    service = new IncrementalNoteService();
  });

  describe('parseFinalResponse', () => {
    it('repairs list-shaped objects returned by the model', () => {
      const response = `{
  "patientDetails": "Name: Mahavidya, Gender: Female, Pregnancy Status: 5 months pregnant (conception date: June 12)",

  "medicalHistory": "Not mentioned",

  "problemsFaced": {
    "- Fever episodes",
    "- Swelling in eyebrows and eyes",
    "- Throat issues",
    "- Morning cough",
    "- Weight: 82 kg"
  },

  "findings": {
    "- Throat: Slightly red",
    "- Temperature: No fever at time of examination",
    "- Pulse: Normal",
    "- Chest: Normal"
  },

  "diagnosis": "Upper respiratory tract infection with pregnancy",

  "investigationsAdvised": "Not mentioned",

  "doctorInstructions": {
    "- Gargle with warm salt water",
    "- Use steam inhalation with hot water",
    "- Take medications as prescribed",
    "- Take Dolo only if fever develops"
  },

  "medicationPrescribed": {
    "1. Cetrizine 10mg - Half tablet twice daily (morning and night) for 5 days",
    "2. Dolo 650mg - As needed for fever",
    "3. Cough syrup - As needed",
    "4. Amrit - As prescribed"
  }
}`;

      const parsed = (service as any).parseFinalResponse(response);

      expect(parsed.patientDetails).toEqual({
        Name: 'Mahavidya',
        Gender: 'Female',
        'Pregnancy Status': '5 months pregnant (conception date: June 12)',
      });
      expect(parsed.problemFaced).toBe(
        'Fever episodes, Swelling in eyebrows and eyes, Throat issues, Morning cough, Weight: 82 kg',
      );
      expect(parsed.findings).toEqual([
        'Throat: Slightly red',
        'Temperature: No fever at time of examination',
        'Pulse: Normal',
        'Chest: Normal',
      ]);
      expect(parsed.diagnosis).toEqual(['Upper respiratory tract infection with pregnancy']);
      expect(parsed.doctorInstructions).toEqual([
        'Gargle with warm salt water',
        'Use steam inhalation with hot water',
        'Take medications as prescribed',
        'Take Dolo only if fever develops',
      ]);
      expect(parsed.medicationPrescribed).toEqual([
        '1. Cetrizine 10mg - Half tablet twice daily (morning and night) for 5 days',
        '2. Dolo 650mg - As needed for fever',
        '3. Cough syrup - As needed',
        '4. Amrit - As prescribed',
      ]);
    });
  });

  describe('generateFinalNote', () => {
    it('returns the default note structure for empty transcripts', async () => {
      const note = await service.generateFinalNote('');

      expect(note.problemFaced).toBe('Not mentioned');
      expect(note.medicalHistory).toEqual(['Not mentioned']);
      expect(note.patientDetails).toEqual({});
    });

    it('returns the default note structure for very short transcripts', async () => {
      const note = await service.generateFinalNote('hi');

      expect(note.problemFaced).toBe('Not mentioned');
      expect(note.findings).toEqual(['Not mentioned']);
    });
  });

  describe('Bedrock adapter contract', () => {
    function anthropicResponse(text: string) {
      return {
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text }] }),
        ),
      };
    }

    it('invokes Anthropic-shaped Bedrock payloads and parses valid JSON responses', async () => {
      mockBedrockSend.mockResolvedValueOnce(
        anthropicResponse(
          JSON.stringify({
            patientDetails: { name: 'Ravi Kumar' },
            medicalHistory: ['None'],
            problemFaced: ['Fever for two days'],
            findings: ['Throat erythema'],
            diagnosis: ['Viral pharyngitis'],
            investigationsAdvised: ['None'],
            doctorInstructions: ['Fluids and rest'],
            medicationPrescribed: ['Paracetamol 500mg'],
          }),
        ),
      );

      const note = await service.generateFinalNote(
        'Patient reports fever and sore throat for two days',
      );

      expect(InvokeModelCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'application/json',
          accept: 'application/json',
        }),
      );

      const commandInput = (InvokeModelCommand as jest.Mock).mock.calls[0][0];
      const payload = JSON.parse(new TextDecoder().decode(commandInput.body));
      expect(payload).toMatchObject({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [{ role: 'user', content: expect.stringContaining('fever') }],
      });

      expect(note.problemFaced).toContain('Fever for two days');
      expect(note.patientDetails).toEqual({ name: 'Ravi Kumar' });
      expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    });

    it('retries ThrottlingException with exponential backoff before succeeding', async () => {
      jest.useFakeTimers();
      const throttled = Object.assign(new Error('Rate exceeded'), {
        name: 'ThrottlingException',
      });

      mockBedrockSend
        .mockRejectedValueOnce(throttled)
        .mockRejectedValueOnce(throttled)
        .mockResolvedValueOnce(
          anthropicResponse(
            JSON.stringify({
              patientDetails: {},
              medicalHistory: ['None'],
              problemFaced: ['Cough'],
              findings: ['Clear lungs'],
              diagnosis: ['URI'],
              investigationsAdvised: ['None'],
              doctorInstructions: ['Rest'],
              medicationPrescribed: ['None'],
            }),
          ),
        );

      const notePromise = service.generateFinalNote(
        'Patient reports persistent cough for one week',
      );

      await jest.runAllTimersAsync();
      const note = await notePromise;

      expect(mockBedrockSend).toHaveBeenCalledTimes(3);
      expect(note.problemFaced).toContain('Cough');
      jest.useRealTimers();
    });

    it('fails fast on non-throttling Bedrock errors', async () => {
      mockBedrockSend.mockRejectedValueOnce(
        Object.assign(new Error('ValidationException'), { name: 'ValidationException' }),
      );

      const note = await service.generateFinalNote(
        'Patient reports persistent cough for one week',
      );

      expect(mockBedrockSend).toHaveBeenCalledTimes(1);
      expect(note.problemFaced).toBe('Not mentioned');
    });

    it('returns default structure when Bedrock returns malformed JSON', async () => {
      mockBedrockSend.mockResolvedValueOnce(
        anthropicResponse('Plain text without medical keywords or json'),
      );

      const note = await service.generateFinalNote(
        'Patient reports persistent cough for one week',
      );

      expect(note.patientDetails).toEqual({});
      expect(note.problemFaced).not.toContain('Fever for two days');
      expect(note.findings).not.toContain('Throat erythema');
    });

    it('parses Nova response bodies when BEDROCK_MODEL_ID includes nova', async () => {
      process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0';
      service = new IncrementalNoteService();

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            results: [{ outputText: JSON.stringify({
              patientDetails: {},
              medicalHistory: ['None'],
              problemFaced: ['Headache'],
              findings: ['Normal neuro exam'],
              diagnosis: ['Tension headache'],
              investigationsAdvised: ['None'],
              doctorInstructions: ['Hydrate'],
              medicationPrescribed: ['None'],
            }) }],
          }),
        ),
      });

      const note = await service.generateFinalNote(
        'Patient reports headache after poor sleep',
      );

      const commandInput = (InvokeModelCommand as jest.Mock).mock.calls.at(-1)[0];
      const payload = JSON.parse(new TextDecoder().decode(commandInput.body));
      expect(payload).toMatchObject({
        inferenceConfig: expect.any(Object),
        input: { inputText: expect.stringContaining('headache') },
      });
      expect(note.problemFaced).toContain('Headache');
    });
  });
});
