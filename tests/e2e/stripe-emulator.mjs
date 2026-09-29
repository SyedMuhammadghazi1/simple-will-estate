// Minimal Stripe API + hosted-checkout emulator for end-to-end and integration tests.
//
// - POST /v1/checkout/sessions            → creates a session (form-encoded, like the real API);
//                                           honours `expires_at` and `Idempotency-Key` (same key +
//                                           same parameters → same session; other parameters → 400
//                                           idempotency_error, like Stripe)
// - GET  /v1/checkout/sessions/:id        → retrieves a session ("expired" once past expires_at;
//                                           `expand[]=payment_intent` supported)
// - POST /v1/checkout/sessions/:id/expire → expires an open session (400 otherwise)
// - GET  /checkout/:id                    → fake hosted checkout page with a "Pay" button
// - POST /checkout/:id/pay                → completes the session, sends a SIGNED
//                                           checkout.session.completed webhook to the app, then
//                                           redirects the browser to success_url
//
// The app runs its real Stripe code path against this server (STRIPE_API_BASE), so nothing in
// the app is bypassed. Never used outside tests.
import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";
import Stripe from "stripe";

const signer = new Stripe("sk_test_signer");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "request-id": `req_${randomUUID()}`,
  });
  res.end(JSON.stringify(body));
}

function invalidRequest(res, message, code) {
  return json(res, code === "resource_missing" ? 404 : 400, {
    error: { type: "invalid_request_error", message, ...(code ? { code } : {}) },
  });
}

/**
 * Creates the emulator (not listening yet). `sessions` and `intents` (PaymentIntent id → status)
 * are exposed so tests can inspect or change them (e.g. mark a session complete); `stats` counts
 * sessions actually created and records the idempotency keys of create requests.
 */
export function createStripeEmulator({
  appUrl = "http://localhost:3001",
  webhookSecret = "whsec_e2e_emulator_secret",
} = {}) {
  const sessions = new Map();
  const idempotent = new Map(); // Idempotency-Key → { body, id }
  const intents = new Map();
  const stats = { creates: 0, idempotencyKeys: [] };

  /** The session as the API returns it now (an open session past expires_at is expired). */
  function current(session) {
    if (session.status === "open" && session.expires_at * 1000 <= Date.now()) {
      session.status = "expired";
    }
    return session;
  }

  async function sendWebhook(session) {
    const event = {
      id: `evt_${randomUUID().replace(/-/g, "")}`,
      object: "event",
      type: "checkout.session.completed",
      api_version: "2025-01-01",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: { object: session },
    };
    const payload = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await fetch(`${appUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    if (!res.ok) throw new Error(`webhook rejected: ${res.status} ${await res.text()}`);
  }

  function createSession(req, raw) {
    const form = new URLSearchParams(raw);
    const id = `cs_test_${randomUUID().replace(/-/g, "")}`;
    const metadata = {};
    for (const [k, v] of form) {
      const m = /^metadata\[(.+)\]$/.exec(k);
      if (m) metadata[m[1]] = v;
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number(form.get("expires_at") ?? now + 24 * 3600);
    if (expiresAt - now < 30 * 60 || expiresAt - now > 24 * 3600) {
      return { error: "expires_at must be between 30 minutes and 24 hours from now" };
    }
    const session = {
      id,
      object: "checkout.session",
      mode: form.get("mode"),
      client_reference_id: form.get("client_reference_id"),
      customer_email: form.get("customer_email"),
      metadata,
      amount_total: Number(form.get("line_items[0][price_data][unit_amount]") ?? 0),
      currency: form.get("line_items[0][price_data][currency]") ?? "usd",
      payment_status: "unpaid",
      payment_intent: `pi_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      status: "open",
      expires_at: expiresAt,
      success_url: form.get("success_url"),
      cancel_url: form.get("cancel_url"),
      url: `http://${req.headers.host}/checkout/${id}`,
    };
    sessions.set(id, session);
    stats.creates++;
    return { session };
  }

  /** A retrieved session, with its PaymentIntent object when asked to expand it. */
  function withExpansions(session, url) {
    const expand = [...url.searchParams].filter(([k]) => /^expand\[\d*\]$/.test(k));
    if (!expand.some(([, v]) => v === "payment_intent")) return session;
    const status =
      intents.get(session.payment_intent) ??
      (session.payment_status === "paid" ? "succeeded" : "requires_payment_method");
    return {
      ...session,
      payment_intent: { id: session.payment_intent, object: "payment_intent", status },
    };
  }

  async function handleApi(req, res, url, id, expire) {
    if (!(req.headers.authorization ?? "").startsWith("Bearer sk_test_")) {
      return json(res, 401, { error: { message: "test keys only" } });
    }
    if (req.method === "POST" && !id) {
      const raw = await readBody(req);
      const key = req.headers["idempotency-key"];
      stats.idempotencyKeys.push(key ?? null);
      const previous = key ? idempotent.get(key) : undefined;
      if (previous) {
        if (previous.body === raw) return json(res, 200, current(sessions.get(previous.id)));
        return json(res, 400, {
          error: {
            type: "idempotency_error",
            message: `Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than '${key}'.`,
          },
        });
      }
      const created = createSession(req, raw);
      if (created.error) return invalidRequest(res, created.error);
      if (key) idempotent.set(key, { body: raw, id: created.session.id });
      return json(res, 200, created.session);
    }
    const session = id ? sessions.get(id) : undefined;
    if (!session) {
      return invalidRequest(res, `No such checkout.session: '${id}'`, "resource_missing");
    }
    if (req.method === "GET" && !expire)
      return json(res, 200, withExpansions(current(session), url));
    if (req.method === "POST" && expire) {
      if (current(session).status !== "open") {
        return invalidRequest(
          res,
          "Only Checkout Sessions with a status of `open` can be expired.",
        );
      }
      session.status = "expired";
      return json(res, 200, session);
    }
    return json(res, 404, { error: { message: `emulator: no route for ${req.method}` } });
  }

  async function handlePage(req, res, session, pay) {
    if (current(session).status !== "open") {
      res.writeHead(410, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><h1>This checkout session is ${session.status}.</h1>`);
    }
    if (req.method === "GET" && !pay) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html><head><title>Test checkout</title></head><body>
<h1>Stripe test checkout (emulator)</h1>
<p>Amount: ${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}</p>
<form method="post" action="/checkout/${session.id}/pay"><button type="submit">Pay (test)</button></form>
<a href="${session.cancel_url}">Cancel</a></body></html>`);
    }
    if (req.method === "POST" && pay) {
      Object.assign(session, { status: "complete", payment_status: "paid" });
      await sendWebhook(session);
      res.writeHead(303, {
        location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id),
      });
      return res.end();
    }
    return json(res, 404, { error: { message: `emulator: no route for ${req.method}` } });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://emulator");
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
      const api = /^\/v1\/checkout\/sessions(?:\/([^/]+))?(\/expire)?$/.exec(url.pathname);
      if (api) return await handleApi(req, res, url, api[1], Boolean(api[2]));
      const page = /^\/checkout\/([^/]+)(\/pay)?$/.exec(url.pathname);
      const session = page ? sessions.get(page[1]) : undefined;
      if (session) return await handlePage(req, res, session, Boolean(page[2]));
      json(res, 404, {
        error: { message: `emulator: no route for ${req.method} ${url.pathname}` },
      });
    } catch (err) {
      console.error("stripe emulator error", err);
      json(res, 500, { error: { message: String(err) } });
    }
  });

  return { server, sessions, intents, stats };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.E2E_STRIPE_PORT ?? 12111);
  const { server } = createStripeEmulator({
    appUrl: process.env.APP_URL ?? "http://localhost:3001",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_emulator_secret",
  });
  server.listen(port, () => console.log(`stripe emulator listening on ${port}`));
}
