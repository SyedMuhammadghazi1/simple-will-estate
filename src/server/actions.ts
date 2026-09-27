import "server-only";
import { isAppError } from "./errors";
import { errorInfo, logger } from "./logger";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Converts an error into a message that is safe to show to the user. */
export function actionError(err: unknown, context: string): ActionResult {
  if (isAppError(err)) return { ok: false, error: err.message };
  // redirect()/notFound() throw special errors that must propagate.
  if (
    err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof err.digest === "string" &&
    err.digest.startsWith("NEXT_")
  ) {
    throw err;
  }
  logger.error({ err: errorInfo(err), context }, "server action failed");
  return { ok: false, error: "Something went wrong. Please try again." };
}
