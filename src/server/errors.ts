/**
 * Typed application errors. Route handlers and server actions translate them into safe,
 * generic responses — internal details are logged, never shown.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this.") {
    super(message, 403, "forbidden");
  }
}

/** Also used for objects that exist but belong to someone else (avoids id enumeration). */
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "validation_failed", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "conflict") {
    super(message, 409, code);
  }
}

export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please wait a moment and try again.", 429, "rate_limited");
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
