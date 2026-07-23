import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import { PendingClinicalNoteProvider } from '../context/pending-clinical-note-context';

type WrapperOptions = {
  router?: MemoryRouterProps;
  withPendingNoteProvider?: boolean;
};

export function createWrapper(options: WrapperOptions = {}) {
  const { router, withPendingNoteProvider = false } = options;

  return function Wrapper({ children }: { children: React.ReactNode }) {
    let tree = <>{children}</>;

    if (withPendingNoteProvider) {
      tree = <PendingClinicalNoteProvider>{tree}</PendingClinicalNoteProvider>;
    }

    return (
      <MemoryRouter {...router}>
        {tree}
      </MemoryRouter>
    );
  };
}

export function renderWithRouter(
  ui: React.ReactElement,
  options: WrapperOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { router, withPendingNoteProvider, ...renderOptions } = options;
  return render(ui, {
    wrapper: createWrapper({ router, withPendingNoteProvider }),
    ...renderOptions,
  });
}
