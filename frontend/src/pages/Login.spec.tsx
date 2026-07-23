import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { renderWithRouter } from '../test/test-utils';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  saveAuthSession: vi.fn(),
}));

import api from '../lib/api';
import { saveAuthSession } from '../lib/auth';

describe('Login page', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('shows a validation error when email or password is missing', async () => {
    renderWithRouter(<Login />);

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    form!.noValidate = true;
    fireEvent.submit(form!);

    expect(await screen.findByText(/please enter both email and password/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('logs in a doctor and navigates home on success', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'doc-1', email: 'doc@test.local' },
      },
    });

    renderWithRouter(<Login />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'doc@test.local');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /log in as doctor/i }));

    await waitFor(() => {
      expect(saveAuthSession).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows an invalid credentials message for 401 responses', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 401, data: {} },
    });

    renderWithRouter(<Login />);

    await user.type(screen.getByRole('textbox', { name: /email/i }), 'doc@test.local');
    await user.type(screen.getByLabelText(/^password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /log in as doctor/i }));

    expect(await screen.findByText(/invalid doctor email or password/i)).toBeInTheDocument();
  });

  it('routes receptionists to the intake page after login', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      data: {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'rec-1', email: 'rec@test.local' },
      },
    });

    renderWithRouter(<Login />);

    await user.click(screen.getByRole('tab', { name: /receptionist/i }));
    await user.type(screen.getByRole('textbox', { name: /email/i }), 'rec@test.local');
    await user.type(screen.getByLabelText(/^password/i), 'secret123');
    await user.click(screen.getByRole('button', { name: /log in as receptionist/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/receptionist/intake', { replace: true });
    });
  });
});
