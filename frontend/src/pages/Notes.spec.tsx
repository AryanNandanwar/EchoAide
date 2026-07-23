import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import NotesPage from './Notes';
import { renderWithRouter } from '../test/test-utils';

vi.mock('../hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ authorized: true, user: { id: 'doc-1', role: 'doctor' } }),
}));

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from '../lib/api';

describe('Notes page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('renders clinical notes after loading', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{
        id: 'note-1',
        createdAt: '2026-07-01T10:00:00.000Z',
        patient: { fullName: 'Asha Rao' },
        medicalHistory: '["Asthma"]',
        problemsFaced: '["Headache"]',
        doctorInstructions: '["Rest"]',
        medicationPrescribed: '["Paracetamol"]',
      }],
    });

    renderWithRouter(<NotesPage />);

    expect(await screen.findByText(/clinical notes/i)).toBeInTheDocument();
    expect(await screen.findByText(/asha rao/i)).toBeInTheDocument();
  });
});
