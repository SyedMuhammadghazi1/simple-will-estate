// Minimal Stripe API + hosted-checkout emulator for end-to-end tests.
//
// - POST /v1/checkout/sessions      → creates a session (form-encoded, like the real API)
// - GET  /checkout/:id              → fake hosted checkout page with a "Pay" button
// - POST /checkout/:id/pay          → sends a SIGNED checkout.session.completed webhook to the
//                                     app, then redirects the browser to success_url
//
// The app runs its real Stripe code path against this server (STRIPE_API_BASE), so nothing in
// the app is bypassed. Never used outside tests.
import { randomUUID } from "node:crypto";
import http from "node:http";
import Stripe from "stripe";

const PORT = Number(process.env.E2E_STRIPE_PORT ?? 12111);
const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_emulator_secret";
const signer = new Stripe("sk_test_signer");
const sessions = new Map();

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
    data: { object: { ...session, payment_status: "paid", status: "complete" } },
  };
  const payload = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${APP_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  if (!res.ok) throw new Error(`webhook rejected: ${res.status} ${await res.text()}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      if (!(req.headers.authorization ?? "").startsWith("Bearer sk_test_")) {
        return json(res, 401, { error: { message: "test keys only" } });
      }
      const form = new URLSearchParams(await readBody(req));
      const id = `cs_test_${randomUUID().replace(/-/g, "")}`;
      const metadata = {};
      for (const [k, v] of form) {
        const m = /^metadata\[(.+)\]$/.exec(k);
        if (m) metadata[m[1]] = v;
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
        success_url: form.get("success_url"),
        cancel_url: form.get("cancel_url"),
        url: `http://localhost:${PORT}/checkout/${id}`,
      };
      sessions.set(id, session);
      return json(res, 200, session);
    }

    const page = /^\/checkout\/([^/]+)(\/pay)?$/.exec(url.pathname);
    if (page) {
      const session = sessions.get(page[1]);
      if (!session) return json(res, 404, { error: "unknown session" });
      if (req.method === "GET" && !page[2]) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><html><head><title>Test checkout</title></head><body>
<h1>Stripe test checkout (emulator)</h1>
<p>Amount: ${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}</p>
<form method="post" action="/checkout/${session.id}/pay"><button type="submit">Pay (test)</button></form>
<a href="${session.cancel_url}">Cancel</a></body></html>`);
      }
      if (req.method === "POST" && page[2]) {
        await sendWebhook(session);
        res.writeHead(303, {
          location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id),
        });
        return res.end();
      }
    }
    json(res, 404, { error: { message: `emulator: no route for ${req.method} ${url.pathname}` } });
  } catch (err) {
    console.error("stripe emulator error", err);
    json(res, 500, { error: { message: String(err) } });
  }
});

server.listen(PORT, () => console.log(`stripe emulator listening on ${PORT}`));
