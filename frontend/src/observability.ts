// Browser OpenTelemetry for EchoAide (Vite SPA). First import in main.tsx.
import { trace, metrics } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SUPERLOG_ENDPOINT = 'https://intake.superlog.sh';
const SUPERLOG_PUBLIC_TOKEN = 'sl_public_5wO0lS5AYaiq0Ocdew2WbkCdax0dv19rGKfs9XlZMG8';
const REPO_URL = 'https://github.com/AryanNandanwar/DoctorScribe-prod';

function superlogHeaders(token: string): Record<string, string> {
  return { 'x-api-key': token };
}

const deploymentEnv = import.meta.env.PROD ? 'production' : 'development';
const headers = superlogHeaders(SUPERLOG_PUBLIC_TOKEN);
const base = SUPERLOG_ENDPOINT.replace(/\/$/, '');

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'echoaide-web',
  [ATTR_SERVICE_VERSION]: '0.0.0',
  'deployment.environment.name': deploymentEnv,
  env: deploymentEnv,
  'vcs.repository.url.full': REPO_URL,
});

try {
  const traceExporter = new OTLPTraceExporter({
    url: `${base}/v1/traces`,
    headers,
  });

  const traceProvider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  traceProvider.register({ contextManager: new ZoneContextManager() });

  const metricExporter = new OTLPMetricExporter({
    url: `${base}/v1/metrics`,
    headers,
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const logExporter = new OTLPLogExporter({
    url: `${base}/v1/logs`,
    headers,
  });
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new UserInteractionInstrumentation(),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /^https:\/\/app\.echoaide\.in/,
          /^https:\/\/intake\.superlog\.sh/,
        ],
        clearTimingResources: true,
      }),
    ],
  });
} catch (err) {
  console.warn('[otel] failed to initialize browser telemetry', err);
}

export const tracer = trace.getTracer('echoaide.web');
export const meter = metrics.getMeter('echoaide.web');

export const recordingSessionStarted = meter.createCounter('recording.session.started');
export const recordingSessionStopped = meter.createCounter('recording.session.stopped');
export const authLoginAttempts = meter.createCounter('auth.login.attempts');
