/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseService } from './supabase-service.ts';

type PostgresHandler = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => void;
type StatusHandler = (status: string, error?: Error) => void;

function createMockSupabaseClient() {
  const channels = new Map<string, {
    handlers: Array<{ event: string; config: Record<string, unknown>; callback: PostgresHandler }>;
    statusHandler?: StatusHandler;
  }>();
  const removedChannels: string[] = [];
  let fetchResponses: Array<{ data: unknown[] | null; error: Error | null }> = [];

  const client = {
    channel(name: string) {
      const state = {
        handlers: [] as Array<{ event: string; config: Record<string, unknown>; callback: PostgresHandler }>,
        statusHandler: undefined as StatusHandler | undefined,
      };
      channels.set(name, state);

      return {
        on(
          _type: 'postgres_changes',
          config: Record<string, unknown>,
          callback: PostgresHandler,
        ) {
          state.handlers.push({
            event: String(config.event),
            config,
            callback,
          });
          return this;
        },
        subscribe(statusHandler: StatusHandler) {
          state.statusHandler = statusHandler;
          statusHandler('SUBSCRIBED');
          return this;
        },
      };
    },
    removeChannel(channel: { __name?: string }) {
      removedChannels.push(channel.__name ?? 'unknown');
    },
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            async eq(_column: string, _value: string) {
              assert.equal(table, 'clinical_notes');
              const next = fetchResponses.shift() ?? { data: [], error: null };
              return next;
            },
          };
        },
      };
    },
    __channels: channels,
    __removedChannels: removedChannels,
    __setFetchResponses(responses: Array<{ data: unknown[] | null; error: Error | null }>) {
      fetchResponses = [...responses];
    },
    __emitInsert(channelName: string, row: Record<string, unknown>) {
      const channel = channels.get(channelName);
      const handler = channel?.handlers.find((entry) => entry.event === 'INSERT');
      handler?.callback({ new: row });
    },
    __emitUpdate(channelName: string, row: Record<string, unknown>) {
      const channel = channels.get(channelName);
      const handler = channel?.handlers.find((entry) => entry.event === 'UPDATE');
      handler?.callback({ new: row });
    },
    __emitStatus(channelName: string, status: string, error?: Error) {
      channels.get(channelName)?.statusHandler?.(status, error);
    },
  };

  return client;
}

test('subscribeToClinicalNote wires INSERT and UPDATE postgres_changes filters', () => {
  const mockClient = createMockSupabaseClient();
  const service = new SupabaseService(mockClient as never);
  const received: Record<string, unknown>[] = [];

  service.subscribeToClinicalNote({
    noteId: 'note-123',
    onNoteGenerated: (note) => received.push(note),
  });

  const channelName = 'clinical_note_note-123';
  assert.ok(mockClient.__channels.has(channelName));

  const handlers = mockClient.__channels.get(channelName)!.handlers;
  assert.equal(handlers.length, 2);
  assert.deepEqual(handlers[0].config, {
    event: 'INSERT',
    schema: 'public',
    table: 'clinical_notes',
    filter: 'id=eq.note-123',
  });
  assert.deepEqual(handlers[1].config, {
    event: 'UPDATE',
    schema: 'public',
    table: 'clinical_notes',
    filter: 'id=eq.note-123',
  });

  mockClient.__emitInsert(channelName, { id: 'note-123', status: 'Draft' });
  mockClient.__emitUpdate(channelName, { id: 'note-123', status: 'Finalized' });

  assert.equal(received.length, 2);
  assert.equal(received[0].status, 'Draft');
  assert.equal(received[1].status, 'Finalized');
});

test('subscribeToClinicalNote guards against duplicate subscriptions', () => {
  const mockClient = createMockSupabaseClient();
  const service = new SupabaseService(mockClient as never);
  let subscribeCount = 0;

  const originalChannel = mockClient.channel.bind(mockClient);
  mockClient.channel = (name: string) => {
    subscribeCount += 1;
    return originalChannel(name);
  };

  service.subscribeToClinicalNote({
    noteId: 'note-dup',
    onNoteGenerated: () => undefined,
  });
  service.subscribeToClinicalNote({
    noteId: 'note-dup',
    onNoteGenerated: () => undefined,
  });

  assert.equal(subscribeCount, 1);
});

test('subscribeToClinicalNote forwards CHANNEL_ERROR to onError', () => {
  const mockClient = createMockSupabaseClient();
  const service = new SupabaseService(mockClient as never);
  const errors: string[] = [];

  service.subscribeToClinicalNote({
    noteId: 'note-error',
    onNoteGenerated: () => undefined,
    onError: (error) => errors.push(error.message),
  });

  mockClient.__emitStatus('clinical_note_note-error', 'CHANNEL_ERROR', new Error('RLS denied'));

  assert.deepEqual(errors, ['Failed to subscribe to clinical note']);
});

test('fetchClinicalNote returns a row and deduplicates concurrent fetches', async () => {
  const mockClient = createMockSupabaseClient();
  const service = new SupabaseService(mockClient as never);

  mockClient.__setFetchResponses([
    { data: [{ id: 'note-fetch', status: 'Draft' }], error: null },
  ]);

  const [first, second] = await Promise.all([
    service.fetchClinicalNote('note-fetch'),
    service.fetchClinicalNote('note-fetch'),
  ]);

  assert.equal(first.id, 'note-fetch');
  assert.equal(second.id, 'note-fetch');
});

test('cleanup removes all active channels', () => {
  const mockClient = createMockSupabaseClient();
  const service = new SupabaseService(mockClient as never);

  service.subscribeToClinicalNote({
    noteId: 'note-clean',
    onNoteGenerated: () => undefined,
  });

  service.cleanup();
  assert.equal(mockClient.__removedChannels.length, 1);
});
