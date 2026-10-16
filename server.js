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

const PRODUCTS = {
  'etq-bike': { amount: 149900, currency: 'eur', name: 'ETQ Apex E-Bike' },
};
const allowed = new Set(['eur']);

app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body ?? {};
    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: { message: 'Unknown productId' } });
    }
    const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 10);
    if (!allowed.has(product.currency)) {
      return res.status(400).json({ error: { message: 'Unsupported currency' } });
    }
    // Amount is computed server-side from the product table — the client never
    // sends an amount, so a tampered request cannot change the price.
    const intent = await stripe.paymentIntents.create({
      amount: product.amount * qty,
      currency: product.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { productId, quantity: String(qty), mode: MODE },
    });
    res.json({ clientSecret: intent.client_secret });
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
