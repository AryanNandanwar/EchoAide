import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { PendingClinicalNoteProvider, usePendingClinicalNote } from './pending-clinical-note-context';

function LifecycleProbe() {
  const ctx = usePendingClinicalNote();
  return (
    <div>
      <span data-testid="note-id">{ctx.noteId ?? 'none'}</span>
      <span data-testid="generating">{String(ctx.isGenerating)}</span>
      <span data-testid="ready">{String(ctx.isReady)}</span>
      <button type="button" onClick={() => ctx.beginNote('note-123', { name: 'Asha' })}>
        Begin
      </button>
      <button type="button" onClick={() => ctx.markNoteReady()}>
        Ready
      </button>
    </div>
  );
}

function SavedProbe() {
  const ctx = usePendingClinicalNote();
  return (
    <>
      <span data-testid="refresh-count">{ctx.noteId ?? 'none'}</span>
      <button type="button" onClick={() => ctx.beginNote('note-456')}>Begin</button>
      <button type="button" onClick={() => ctx.clearPendingNote({ saved: true })}>Save</button>
    </>
  );
}

describe('PendingClinicalNoteProvider', () => {
  it('tracks generating and ready states through the note lifecycle', async () => {
    const user = userEvent.setup();

    render(
      <PendingClinicalNoteProvider>
        <LifecycleProbe />
      </PendingClinicalNoteProvider>,
    );

    expect(screen.getByTestId('note-id')).toHaveTextContent('none');

    await user.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByTestId('note-id')).toHaveTextContent('note-123');
    expect(screen.getByTestId('generating')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'Ready' }));
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('generating')).toHaveTextContent('false');
  });

  it('invokes the saved callback when clearPendingNote is called with saved=true', async () => {
    const user = userEvent.setup();
    let refreshCount = 0;

    function RefreshProbe() {
      const ctx = usePendingClinicalNote();
      useEffect(() => ctx.registerOnNoteSaved(() => {
        refreshCount += 1;
      }), [ctx]);
      return <SavedProbe />;
    }

    render(
      <PendingClinicalNoteProvider>
        <RefreshProbe />
      </PendingClinicalNoteProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(refreshCount).toBe(1);
    expect(screen.getByTestId('refresh-count')).toHaveTextContent('none');
  });
});
