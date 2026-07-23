import {
  metrics,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';

export const tracer = trace.getTracer('echoaide.api');
export const meter = metrics.getMeter('echoaide.api');

export const streamingSessionStarted = meter.createCounter('streaming.session.started');
export const streamingSessionCompleted = meter.createCounter('streaming.session.completed');
export const clinicalNoteGenerated = meter.createCounter('clinical_note.generated');
export const transcriptionSonioxConnected = meter.createCounter('transcription.soniox.connected');
export const authLoginAttempts = meter.createCounter('auth.login.attempts');
export const intakeCreated = meter.createCounter('intake.created');

/** Local CJS-safe replacement for @superlog/otel-helpers (ESM-only). */
export type WithSpanOptions = {
  tracer?: Tracer;
  attributes?: Attributes;
  kind?: SpanKind;
};

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options: WithSpanOptions = {},
): Promise<T> {
  const {
    tracer: activeTracer = tracer,
    attributes,
    kind = SpanKind.INTERNAL,
  } = options;

  return activeTracer.startActiveSpan(
    name,
    { attributes, kind },
    async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export function recordSpanError(span: Span, err: unknown): void {
  span.recordException(err instanceof Error ? err : new Error(String(err)));
  span.setStatus({ code: SpanStatusCode.ERROR });
  span.setAttributes({
    'error.type':
      err instanceof Error
        ? err.name || 'Error'
        : typeof err === 'object' &&
            err !== null &&
            typeof (err as { code?: unknown }).code === 'string'
          ? ((err as { code: string }).code)
          : typeof err,
  });
}
