import "server-only";
import pino, { type Logger } from "pino";

/**
 * JSON logs in production; human-friendly single-line output in development.
 * Never log secrets or questionnaire contents — `redact` is a safety net, not a licence.
 */

const REDACT = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "headers.cookie",
  "*.headers.cookie",
  "answers",
  "*.answers",
  "email",
  "*.email",
  "secret",
  "*.secret",
];

function createLogger(): Logger {
  const isDev = process.env.NODE_ENV === "development";
  const level = process.env.LOG_LEVEL || (isDev ? "debug" : "info");
  return pino({
    level,
    base: { service: "plainwill" },
    redact: { paths: REDACT, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

declare global {
  var __plainwillLogger: Logger | undefined;
}

export const logger: Logger = (globalThis.__plainwillLogger ??= createLogger());

export function errorInfo(err: unknown): { message: string; name?: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    };
  }
  return { message: String(err) };
}
