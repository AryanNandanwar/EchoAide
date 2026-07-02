import { metrics, trace } from '@opentelemetry/api';

export const tracer = trace.getTracer('echoaide.api');
export const meter = metrics.getMeter('echoaide.api');

export const streamingSessionStarted = meter.createCounter('streaming.session.started');
export const streamingSessionCompleted = meter.createCounter('streaming.session.completed');
export const clinicalNoteGenerated = meter.createCounter('clinical_note.generated');
export const transcriptionSonioxConnected = meter.createCounter('transcription.soniox.connected');
