import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingClinicalNotePanel from './PendingClinicalNotePanel';
import { PendingClinicalNoteProvider, usePendingClinicalNote } from '../context/pending-clinical-note-context';

vi.mock('./ClinicalNoteViewer', () => ({
  default: ({ noteId }: { noteId: string }) => (
    <div data-testid="clinical-note-viewer">Viewer for {noteId}</div>
  ),
}));

function SeedPendingNote() {
  const { beginNote } = usePendingClinicalNote();
  return (
    <button type="button" onClick={() => beginNote('pending-note-1', { name: 'Asha' })}>
      Seed
    </button>
  );
}

describe('PendingClinicalNotePanel', () => {
  it('renders nothing when there is no pending note', () => {
    const { container } = render(
      <PendingClinicalNoteProvider>
        <PendingClinicalNotePanel />
      </PendingClinicalNoteProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the clinical note viewer when a pending note exists', async () => {
    const user = userEvent.setup();

    render(
      <PendingClinicalNoteProvider>
        <SeedPendingNote />
        <PendingClinicalNotePanel />
      </PendingClinicalNoteProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Seed' }));

    expect(screen.getByTestId('clinical-note-viewer')).toHaveTextContent('pending-note-1');
  });
});
