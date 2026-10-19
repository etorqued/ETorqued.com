// ETORQUED checkout Worker — replaces the Node/Express server on serverless
// hosting (Cloudflare Workers via the Sites platform). Same catalogue, same
// server-computed amounts, same guards. Reads keys from environment bindings:
//   STRIPE_SECRET_KEY        (secret set via Sites → Secrets)
//   STRIPE_PUBLISHABLE_KEY   (public value; safe to expose to visitors)
//   ALLOWED_HOSTS            (optional comma-separated host allowlist override)

const PRODUCTS = {
  'apex-pro': { amount: 89999, currency: 'eur', name: 'ETQ APEX' },
  'vortex-stealth': { amount: 149999, currency: 'eur', name: 'ETQ VORTEX' },
  'apex-vented-front-plate': { amount: 2299, currency: 'eur', name: '"Apex" Vented Plate' },
  'vortex-vented-front-plate': { amount: 2299, currency: 'eur', name: '"Vortex" Vented Plate' },
};
PRODUCTS['etq-bike'] = PRODUCTS['vortex-stealth']; // legacy alias

const MAX_ITEMS = 50; // units per order
const MAX_QTY = 10;   // per line
const SECRET_MASK = /^[sS][kK]_[lL]i[vV][eE]_|^[sS][kK]_[tT][eE][sS][tT]_/;
const HOST_SUFFIXES = /^(\.etorqued\.com$)/; // product & preview hosts
const DEFAULT_HOSTS = ['etorqued.com', 'www.etorqued.com', 'localhost'];

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function allowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (raw.length) return raw;
  return [
    'https://etorqued.com', 'https://www.etorqued.com',
    'http://localhost:4242', 'http://localhost:4243',
  ];
}

// Same-origin requests still send an Origin header on POST; those always pass.
function isSameOrigin(origin, url) {
  try { return new URL(origin).hostname === url.hostname; } catch { return false; }
}

function json(body, { status = 200, corsOrigin = null, extra = {} } = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...extra };
  if (corsOrigin) Object.assign(headers, corsHeaders(corsOrigin));
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// --- Stripe REST (fetch-based, no SDK bundling risk) -------------------------
async function stripeCreatePaymentIntent(secret, amount, currency, metadata) {
  const params = new URLSearchParams({
    amount: String(amount),
    currency,
    'automatic_payment_methods[enabled]': 'true',
  });
  for (const [k, v] of Object.entries(metadata)) params.set(`metadata[${k}]`, v);
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const origin = request.headers.get('Origin') || '';

    if (!/^[a-z]+_/.test(env.STRIPE_SECRET_KEY || '') || env.STRIPE_SECRET_KEY === 'not_yet_set') {
      return json({ error: { message: 'Payment backend not configured — set STRIPE_SECRET_KEY in Sites → Secrets.' } }, { status: 503 });
    }
    if (!SECRET_MASK.test(env.STRIPE_SECRET_KEY)) {
      return json({ error: { message: 'STRIPE_SECRET_KEY must start with sk_live_ or sk_test_.' } }, { status: 503 });
    }

    // Host allowlist (defense in depth against spoofed Host headers).
    const hostAllow = (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const hostOk = hostAllow.length
      ? hostAllow.includes(hostname) || hostAllow.some((h) => hostname.endsWith(`.${h}`))
      : DEFAULT_HOSTS.includes(hostname) || HOST_SUFFIXES.test(`.${hostname}`.replace(hostname, `.${hostname}`)) || hostname.endsWith('.etorqued.com') || hostname.endsWith('.etorqued.com');
    if (!hostOk) return json({ error: { message: 'Forbidden host' } }, { status: 403 });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Cross-origin calls must come from an allowed origin; same-origin requests
    // (including POSTs, which carry Origin even same-origin) always pass.
    if (origin && !isSameOrigin(origin, url) && !allowedOrigins(env).includes(origin)) {
      return json({ error: { message: 'Origin not allowed' } }, { status: 403, corsOrigin: origin });
    }

    // --- Checkout page served with the publishable key + mode injected -------
    if (request.method === 'GET' && (url.pathname === '/checkout' || url.pathname === '/checkout/' || url.pathname === '/checkout.html')) {
      const assetRes = await env.ASSETS.fetch(new Request('https://assets.local/checkout.html'));
      const rawHtml = await assetRes.text();
      const html = rawHtml
        .replaceAll('__STRIPE_PUBLISHABLE_KEY__', env.STRIPE_PUBLISHABLE_KEY || '')
        .replaceAll('__STRIPE_MODE__', env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test');
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    // --- Read-only catalogue -------------------------------------------------
    if (request.method === 'GET' && url.pathname === '/api/products') {
      const out = {};
      for (const [id, p] of Object.entries(PRODUCTS)) {
        if (id === 'etq-bike') continue;
        out[id] = { name: p.name, amount: p.amount, currency: p.currency };
      }
      return json(out, { corsOrigin: origin || request.headers.get('Origin') });
    }

    // --- Payment intent (server-authoritative pricing) ----------------------
    if (request.method === 'POST' && url.pathname === '/api/create-payment-intent') {
      const body = await readJson(request);
      try {
        if (Array.isArray(body.items) && body.items.length) {
          const byId = new Map();
          for (const it of body.items.slice(0, MAX_ITEMS)) {
            const id = String(it?.productId ?? '');
            const product = PRODUCTS[id];
            if (!product) return json({ error: { message: `Unknown productId: ${id}` } }, { status: 400 });
            const qty = Math.min(Math.max(parseInt(it?.quantity, 10) || 1, 1), MAX_QTY);
            byId.set(id, (byId.get(id) || 0) + qty);
          }
          let totalUnits = 0; let amount = 0; const lines = [];
          for (const [id, qty] of byId) {
            totalUnits += qty;
            amount += PRODUCTS[id].amount * qty;
            lines.push(`${id}x${qty}`);
          }
          if (totalUnits > MAX_ITEMS) return json({ error: { message: `Order too large (max ${MAX_ITEMS} units)` } }, { status: 400 });
          if (!amount) return json({ error: { message: 'Cart total is zero' } }, { status: 400 });
          const intent = await stripeCreatePaymentIntent(env.STRIPE_SECRET_KEY, amount, 'eur', {
            items: lines.slice(0, 40).join(','),
            mode: env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test',
          });
          return json({ clientSecret: intent.client_secret, amount, lines });
        }

        // Legacy single-product shape.
        const { productId, quantity = 1 } = body;
        const product = PRODUCTS[productId];
        if (!product) return json({ error: { message: 'Unknown productId' } }, { status: 400 });
        const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), MAX_QTY);
        const amount = product.amount * qty;
        const intent = await stripeCreatePaymentIntent(env.STRIPE_SECRET_KEY, amount, product.currency, {
          productId, quantity: String(qty), mode: env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test',
        });
        return json({ clientSecret: intent.client_secret, amount, lines: [`${productId}x${qty}`] });
      } catch (err) {
        console.error('create-payment-intent failed:', err?.message);
        return json({ error: { message: err?.message || 'Failed to create PaymentIntent' } }, { status: 502 });
      }
    }

    // --- Everything else is a static asset ----------------------------------
    return env.ASSETS.fetch(request);
  },
};

// deploy manifest notes: modules ESM worker, assetsDirectory ./public
// (the checkout.html referenced by ASSETS lives there; /checkout is intercepted above).
