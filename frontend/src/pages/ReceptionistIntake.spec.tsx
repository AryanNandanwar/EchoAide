import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReceptionistIntakePage from './ReceptionistIntake';
import { renderWithRouter } from '../test/test-utils';

vi.mock('../hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ authorized: true, user: { id: 'rec-1', role: 'receptionist' } }),
}));

vi.mock('../components/navbar', () => ({
  default: () => <div data-testid="navbar" />,
}));

vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '../lib/api';

describe('ReceptionistIntake page', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it('requires a patient name before submitting', async () => {
    renderWithRouter(<ReceptionistIntakePage />);

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    form!.noValidate = true;
    fireEvent.submit(form!);

    expect(await screen.findByText(/patient name is required/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits intake data and shows a success message', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'intake-1' } });

    renderWithRouter(<ReceptionistIntakePage />);

    await user.type(screen.getByLabelText(/^name/i), 'Jane Patient');
    await user.type(screen.getByLabelText(/contact/i), '9876543210');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/intake/patients', expect.objectContaining({
        fullName: 'Jane Patient',
        phone: '9876543210',
      }));
    });

    expect(await screen.findByText(/added to the doctor's queue/i)).toBeInTheDocument();
  });
});
