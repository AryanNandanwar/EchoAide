import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace } from '@opentelemetry/api';

const severityByLevel: Record<LogLevel, SeverityNumber> = {
  log: SeverityNumber.INFO,
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  debug: SeverityNumber.DEBUG,
  verbose: SeverityNumber.DEBUG,
  fatal: SeverityNumber.FATAL,
};

const otelLogger = logs.getLogger('echoaide.api');

function formatMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export class OtelBridgedLogger extends ConsoleLogger {
  private emitToOtel(
    message: unknown,
    context?: string,
    logLevel: LogLevel = 'log',
  ): void {
    try {
      const span = trace.getActiveSpan();
      const spanContext = span?.spanContext();
      otelLogger.emit({
        severityNumber: severityByLevel[logLevel] ?? SeverityNumber.INFO,
        severityText: logLevel.toUpperCase(),
        body: formatMessage(message),
        attributes: context ? { 'log.context': context } : undefined,
        ...(spanContext?.traceId
          ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
          : {}),
      });
    } catch {
      // Telemetry must not break application logging.
    }
  }

  log(message: unknown, context?: string): void {
    super.log(message, context);
    this.emitToOtel(message, context, 'log');
  }

  error(message: unknown, stack?: string, context?: string): void {
    super.error(message, stack, context);
    this.emitToOtel(message, context, 'error');
  }

  warn(message: unknown, context?: string): void {
    super.warn(message, context);
    this.emitToOtel(message, context, 'warn');
  }

  debug(message: unknown, context?: string): void {
    super.debug(message, context);
    this.emitToOtel(message, context, 'debug');
  }

  verbose(message: unknown, context?: string): void {
    super.verbose(message, context);
    this.emitToOtel(message, context, 'verbose');
  }

  fatal(message: unknown, context?: string): void {
    super.fatal(message, context);
    this.emitToOtel(message, context, 'fatal');
  }
}
