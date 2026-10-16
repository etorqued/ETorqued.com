// ETORQUED — Stripe PaymentIntent backend (also accepts live keys).
// Keys load from .env.local (gitignored, never committed).
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4242;

// Accept test AND live secret keys (whichever is configured), nothing else.
const key = process.env.STRIPE_SECRET_KEY;
const isTest = key?.startsWith('sk_test_');
const isLive = key?.startsWith('sk_live_');
if (!isTest && !isLive) {
  console.error('FATAL: STRIPE_SECRET_KEY must start with sk_test_ or sk_live_. Check .env.local.');
  process.exit(1);
}
const MODE = isLive ? 'live' : 'test';
const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

// Publishable key must match the mode of the secret key: live with live, test with test.
const pub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const pubOk = pub && pub.startsWith(MODE === 'live' ? 'pk_live_' : 'pk_test_');
if (!pubOk) {
  console.error(`FATAL: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be pk_${MODE}_. Check .env.local.`);
  process.exit(1);
}

// --- Cross-origin protection -------------------------------------------------
// Only these origins may call the API and load /checkout. In live mode the
// localhost default is removed so only the production origin is allowed.
// To allow localhost while inspecting a live-mode server locally, set only
// locally (never in production): ALLOWED_ORIGINS=http://localhost:4242
const defaultOrigins = MODE === 'live'
  ? ['https://etorqued.com', 'https://www.etorqued.com']
  : ['http://localhost:4242', 'http://localhost:5181', 'http://127.0.0.1:4242'];
const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin/server-to-server
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST'],
};
app.use(cors(corsOptions));

// In live mode, reject any request whose Host header is not a production host.
// (Cheap CSRF surface reduction: cross-site forms can still POST here.)
if (MODE === 'live') {
  app.use((req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    if (!/(^|\.)etorqued\.com$/.test(host) && !/^localhost(:\d+)?$/.test(host)) {
      return res.status(403).json({ error: { message: 'Forbidden host' } });
    }
    next();
  });
}

app.use(express.json());

// Make cors-rejection a clean 403 instead of an unlabelled 500.
app.use((err, req, res, next) => {
  if (err && /Origin not allowed/i.test(err.message)) {
    return res.status(403).json({ error: { message: 'Origin not allowed' } });
  }
  next(err);
});

// Serve the checkout page with the publishable key + mode injected at request
// time. The raw file on disk holds only placeholders.
import fs from 'fs';
const checkoutHtml = () =>
  fs.readFileSync(new URL('./checkout.html', import.meta.url), 'utf8')
    .replaceAll('__STRIPE_PUBLISHABLE_KEY__', pub)
    .replaceAll('__STRIPE_MODE__', MODE);

app.get('/checkout', (req, res) => {
  res.type('html').send(checkoutHtml());
});

// Read-only catalogue for rendering the cart. Amounts here are for display;
// the charge is always recomputed server-side at intent creation.
app.get('/api/products', (req, res) => {
  const out = {};
  for (const [id, p] of Object.entries(PRODUCTS)) {
    if (id === 'etq-bike') continue; // legacy alias, not a real product
    out[id] = { name: p.name, amount: p.amount, currency: p.currency };
  }
  res.json(out);
});

// --- Product catalogue (server-authoritative prices) --------------------------
// Prices are in euro cents, matching the live store. The client never sends an
// amount — it sends only product IDs and quantities.
const PRODUCTS = {
  'apex-pro':              { amount:  89999, currency: 'eur', name: 'ETQ APEX' },
  'vortex-stealth':        { amount: 149999, currency: 'eur', name: 'ETQ VORTEX' },
  'apex-vented-front-plate':   { amount: 2299, currency: 'eur', name: '"Apex" Vented Plate' },
  'vortex-vented-front-plate': { amount: 2299, currency: 'eur', name: '"Vortex" Vented Plate' },
};
// legacy id kept so an older client still gets the right product:
PRODUCTS['etq-bike'] = PRODUCTS['vortex-stealth'];
const allowed = new Set(['eur']);
const MAX_ITEMS = 50;      // total units per order
const MAX_QTY = 10;        // per line

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const body = req.body ?? {};
    let items;

    // New cart shape: { items: [{ productId, quantity }, ...] }
    if (Array.isArray(body.items) && body.items.length) {
      // Clamp to MAX_ITEMS lines, de-duplicate by productId, clamp quantities.
      const byId = new Map();
      for (const it of body.items.slice(0, MAX_ITEMS)) {
        const id = String(it?.productId ?? '');
        const product = PRODUCTS[id];
        if (!product) {
          return res.status(400).json({ error: { message: `Unknown productId: ${id}` } });
        }
        if (!allowed.has(product.currency)) {
          return res.status(400).json({ error: { message: 'Unsupported currency' } });
        }
        const qty = Math.min(Math.max(parseInt(it?.quantity, 10) || 1, 1), MAX_QTY);
        byId.set(id, (byId.get(id) || 0) + qty);
      }
      let totalUnits = 0;
      let amount = 0;
      const lines = [];
      for (const [id, qty] of byId) {
        totalUnits += qty;
        amount += PRODUCTS[id].amount * qty;
        lines.push(`${id}x${qty}`);
      }
      if (totalUnits > MAX_ITEMS) {
        return res.status(400).json({ error: { message: `Order too large (max ${MAX_ITEMS} units)` } });
      }
      if (!amount) {
        return res.status(400).json({ error: { message: 'Cart total is zero' } });
      }
      // Amount is computed server-side from the product table — the client never
      // sends an amount, so a tampered request cannot change the price.
      const intent = await stripe.paymentIntents.create({
        amount,
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        metadata: { items: lines.slice(0, 40).join(','), mode: MODE },
      });
      return res.json({ clientSecret: intent.client_secret, amount, lines });
    }

    // Legacy single-product shape: { productId, quantity }
    const { productId, quantity = 1 } = body;
    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: { message: 'Unknown productId' } });
    }
    const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), MAX_QTY);
    if (!allowed.has(product.currency)) {
      return res.status(400).json({ error: { message: 'Unsupported currency' } });
    }
    const intent = await stripe.paymentIntents.create({
      amount: product.amount * qty,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { productId, quantity: String(qty), mode: MODE },
    });
    res.json({ clientSecret: intent.client_secret, amount: product.amount * qty, lines: [`${productId}x${qty}`] });
  } catch (err) {
    console.error('create-payment-intent failed:', err?.message);
    res.status(500).json({ error: { message: 'Failed to create PaymentIntent' } });
  }
});

app.listen(port, () => {
  console.log(`ETORQUED checkout server (${MODE.toUpperCase()} MODE) on http://localhost:${port}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  if (MODE === 'live') {
    console.log('LIVE MODE: real charges. Confirm Apple Pay/Google Pay domains in the Stripe Dashboard before launch.');
  }
});
