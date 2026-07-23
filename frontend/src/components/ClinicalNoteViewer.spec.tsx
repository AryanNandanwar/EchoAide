import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClinicalNoteViewer from './ClinicalNoteViewer';

const useClinicalNoteSubscription = vi.fn();

vi.mock('../hooks/use-clinical-note-subscription', () => ({
  useClinicalNoteSubscription: (...args: unknown[]) => useClinicalNoteSubscription(...args),
}));

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('ClinicalNoteViewer', () => {
  beforeEach(() => {
    useClinicalNoteSubscription.mockReset();
    useClinicalNoteSubscription.mockImplementation(() => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      fetchNote: vi.fn(),
    }));
  });

  it('shows the generating placeholder before a note arrives', () => {
    render(
      <ClinicalNoteViewer noteId="note-generating" className="w-full" />,
    );

    expect(screen.getByText(/your clinical note is being generated/i)).toBeInTheDocument();
    expect(useClinicalNoteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'note-generating' }),
    );
  });

  it('renders subscription errors with recovery actions', async () => {
    useClinicalNoteSubscription.mockImplementation(({ onError }) => {
      queueMicrotask(() => onError?.(new Error('NOTE_NOT_CREATED')));
      return {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        fetchNote: vi.fn(),
      };
    });

    render(
      <ClinicalNoteViewer noteId="note-error" className="w-full" />,
    );

    expect(await screen.findByRole('button', { name: /back to home/i })).toBeInTheDocument();
    expect(screen.getByText(/no speech was detected/i)).toBeInTheDocument();
  });

  it('renders parsed note content from the subscription callback', async () => {
    useClinicalNoteSubscription.mockImplementation(({ onNoteGenerated }) => {
      queueMicrotask(() => {
        onNoteGenerated?.({
          id: 'note-ready',
          patient_details: '{"name":"Asha Rao"}',
          medical_history: '["Asthma"]',
          problems_faced: '["Headache"]',
          findings: '["Normal exam"]',
          diagnosis: '["Tension headache"]',
          investigations_advised: '["None"]',
          doctor_instructions: '["Rest"]',
          medication_prescribed: '["Paracetamol"]',
        });
      });
      return {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        fetchNote: vi.fn(),
      };
    });

    render(
      <ClinicalNoteViewer noteId="note-ready" className="w-full" />,
    );

    await waitFor(() => {
      expect(screen.getByText(/clinical note/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/asha rao/i)).toBeInTheDocument();
    expect(screen.getByText('Headache', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/paracetamol/i)).toBeInTheDocument();
  });
});
