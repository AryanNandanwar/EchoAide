import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import PendingNotesPage from './PendingNotes';
import { renderWithRouter } from '../test/test-utils';

vi.mock('../hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ authorized: true, user: { id: 'doc-1', role: 'doctor' } }),
}));

vi.mock('../components/PendingDraftNotesSection', () => ({
  default: () => <div data-testid="pending-draft-notes">Draft section</div>,
}));

describe('PendingNotes page', () => {
  it('renders the pending notes heading and draft section for authorized doctors', () => {
    renderWithRouter(<PendingNotesPage />, { withPendingNoteProvider: true });

    expect(screen.getByText(/pending notes/i)).toBeInTheDocument();
    expect(screen.getByText(/finish incomplete clinical notes/i)).toBeInTheDocument();
    expect(screen.getByTestId('pending-draft-notes')).toBeInTheDocument();
  });
});
