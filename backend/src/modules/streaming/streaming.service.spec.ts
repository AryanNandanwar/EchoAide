import {
  getNoteSkipReasonForTranscript,
  isNoteUnusable,
  isTranscriptTooShortForNote,
} from './streaming.service';

describe('streaming transcript validation', () => {
  it('treats empty transcripts as too short for note generation', () => {
    expect(isTranscriptTooShortForNote('')).toBe(true);
    expect(isTranscriptTooShortForNote('   ')).toBe(true);
    expect(getNoteSkipReasonForTranscript('')).toBe('empty_transcript');
  });

  it('treats very short transcripts as too short for note generation', () => {
    expect(isTranscriptTooShortForNote('hi')).toBe(true);
    expect(getNoteSkipReasonForTranscript('hi')).toBe('transcript_too_short');
  });

  it('allows meaningful transcripts through', () => {
    expect(isTranscriptTooShortForNote('patient has fever and cough')).toBe(false);
  });

  it('maps whitespace-only transcripts to empty_transcript', () => {
    expect(getNoteSkipReasonForTranscript('   ')).toBe('empty_transcript');
  });

  it('maps short non-empty transcripts to transcript_too_short', () => {
    expect(getNoteSkipReasonForTranscript('hello')).toBe('transcript_too_short');
  });

  it('treats all-Not-mentioned AI notes as unusable', () => {
    expect(
      isNoteUnusable({
        patientDetails: {},
        medicalHistory: ['Not mentioned'],
        problemFaced: 'Not mentioned',
        findings: ['Not mentioned'],
        diagnosis: ['Not mentioned'],
        investigationsAdvised: ['Not mentioned'],
        doctorInstructions: ['Not mentioned'],
        medicationPrescribed: ['Not mentioned'],
      }),
    ).toBe(true);
  });

  it('accepts AI notes with at least one meaningful section', () => {
    expect(
      isNoteUnusable({
        patientDetails: {},
        medicalHistory: ['Not mentioned'],
        problemFaced: 'Pregnancy at 20 weeks',
        findings: ['Not mentioned'],
        diagnosis: ['Not mentioned'],
        investigationsAdvised: ['Not mentioned'],
        doctorInstructions: ['Not mentioned'],
        medicationPrescribed: ['Not mentioned'],
      }),
    ).toBe(false);
  });
});
