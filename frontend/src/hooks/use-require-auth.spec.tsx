import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRequireAuth } from './use-require-auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../lib/auth', () => ({
  clearAuth: vi.fn(),
  getStoredUser: vi.fn(),
  hasValidSession: vi.fn(),
  ensureValidAccessToken: vi.fn(),
}));

import {
  clearAuth,
  ensureValidAccessToken,
  getStoredUser,
  hasValidSession,
} from '../lib/auth';

describe('useRequireAuth', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(getStoredUser).mockReturnValue(null);
    vi.mocked(hasValidSession).mockReturnValue(false);
    vi.mocked(ensureValidAccessToken).mockResolvedValue(null);
  });

  it('redirects to login when no stored user exists', async () => {
    renderHook(() => useRequireAuth());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    expect(clearAuth).toHaveBeenCalled();
  });

  it('redirects receptionists away from doctor-only routes', async () => {
    vi.mocked(getStoredUser).mockReturnValue({
      id: 'rec-1',
      email: 'rec@test.local',
      role: 'receptionist',
    });
    vi.mocked(hasValidSession).mockReturnValue(true);
    vi.mocked(ensureValidAccessToken).mockResolvedValue('token');

    const { result } = renderHook(() =>
      useRequireAuth({
        requiredRole: 'doctor',
        wrongRoleRedirect: '/receptionist/intake',
      }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/receptionist/intake', { replace: true });
    });
    expect(result.current.authorized).toBe(false);
  });

  it('authorizes a valid doctor session', async () => {
    vi.mocked(getStoredUser).mockReturnValue({
      id: 'doc-1',
      email: 'doc@test.local',
      role: 'doctor',
    });
    vi.mocked(hasValidSession).mockReturnValue(true);
    vi.mocked(ensureValidAccessToken).mockResolvedValue('access-token');

    const { result } = renderHook(() =>
      useRequireAuth({ requiredRole: 'doctor' }),
    );

    await waitFor(() => {
      expect(result.current.authorized).toBe(true);
    });
    expect(result.current.user?.id).toBe('doc-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
