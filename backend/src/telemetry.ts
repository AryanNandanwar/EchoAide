// OpenTelemetry bootstrap for EchoAide API (NestJS). Loaded before Nest in main.ts.
import { Logger } from '@nestjs/common';
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { metrics } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { OtelBridgedLogger } from './otel-logger';

const SUPERLOG_ENDPOINT = 'https://intake.superlog.sh';
const SUPERLOG_PUBLIC_TOKEN = 'sl_public_5wO0lS5AYaiq0Ocdew2WbkCdax0dv19rGKfs9XlZMG8';
const REPO_URL = 'https://github.com/AryanNandanwar/DoctorScribe-prod';

function superlogHeaders(token: string): Record<string, string> {
  return { 'x-api-key': token };
}

function deploymentEnvironment(): string {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function commitRevision(): string | undefined {
  return (
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT ||
    undefined
  );
}

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  if (process.env.OTEL_DIAG_DEBUG === '1') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const deploymentEnv = deploymentEnvironment();
  const headers = superlogHeaders(SUPERLOG_PUBLIC_TOKEN);
  const base = SUPERLOG_ENDPOINT.replace(/\/$/, '');

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'echoaide-api',
    [ATTR_SERVICE_VERSION]: '0.0.1',
    'deployment.environment.name': deploymentEnv,
    env: deploymentEnv,
    'vcs.repository.url.full': REPO_URL,
    ...(commitRevision() ? { 'vcs.ref.head.revision': commitRevision() } : {}),
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${base}/v1/traces`,
    headers,
  });
  const metricExporter = new OTLPMetricExporter({
    url: `${base}/v1/metrics`,
    headers,
  });
  const logExporter = new OTLPLogExporter({
    url: `${base}/v1/logs`,
    headers,
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter)],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
      }),
    ],
  });

  sdk.start();
  metrics.getMeter('echoaide.api');
  Logger.overrideLogger(new OtelBridgedLogger());

  const shutdown = async () => {
    try {
      await sdk.shutdown();
      await loggerProvider.shutdown();
    } catch (err) {
      console.error('[otel] shutdown error', err);
    }
  };

  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

initTelemetry();
