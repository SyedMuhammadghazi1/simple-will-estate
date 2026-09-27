/**
 * Runs once when the server starts. Logs the legal-review warning for state rules so it is
 * impossible to miss in production logs until every jurisdiction has been verified.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { unreviewedStatesWarning } = await import("@/lib/states");
  const warning = unreviewedStatesWarning();
  if (warning) {
    console.warn(
      JSON.stringify({
        level: "warn",
        time: new Date().toISOString(),
        service: "plainwill",
        msg: warning,
      }),
    );
  }
  if (process.env.NODE_ENV === "production" && process.env.PAYMENTS_MODE === "test-bypass") {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "PAYMENTS_MODE=test-bypass is ignored in production; payments require Stripe.",
      }),
    );
  }
}
