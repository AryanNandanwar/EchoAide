import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientsPage from './Patients';
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

describe('Patients page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('renders the patient list after loading', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/doctor/me/patients') {
        return {
          data: [{
            id: 'patient-1',
            fullName: 'Asha Rao',
            phone: '9876543210',
            createdAt: '2026-07-01T10:00:00.000Z',
          }],
        };
      }
      if (url.includes('/count')) {
        return { data: { count: 2 } };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderWithRouter(<PatientsPage />);

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText(/my patients/i)).toBeInTheDocument();
  });

  it('filters patients by search query', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/api/doctor/me/patients') {
        return {
          data: [
            { id: 'p1', fullName: 'Asha Rao', phone: '111', createdAt: '2026-07-01T10:00:00.000Z' },
            { id: 'p2', fullName: 'John Doe', phone: '222', createdAt: '2026-07-01T10:00:00.000Z' },
          ],
        };
      }
      return { data: { count: 0 } };
    });

    const user = userEvent.setup();
    renderWithRouter(<PatientsPage />);

    await screen.findByText('Asha Rao');
    await user.type(screen.getByPlaceholderText(/search name or phone/i), 'John');

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
    });
  });
});
