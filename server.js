// ETORQUED — test-mode PaymentIntent backend.
// Loads STRIPE_SECRET_KEY from .env.local (never committed).
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import dotenv from 'dotenv';

// Load .env.local (then .env as fallback) — keys live in .env.local
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4242;

const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith('sk_test_')) {
  console.error('FATAL: STRIPE_SECRET_KEY missing or not a test-mode key. Check .env.local.');
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: '2024-06-20' });

app.use(cors({ origin: true })); // dev only — lock down before real money
app.use(express.json());

// Serve the checkout page with the publishable key injected from .env.local.
// The raw file on disk holds only a __STRIPE_PUBLISHABLE_KEY__ placeholder.
import fs from 'fs';
const checkoutHtml = () =>
  fs.readFileSync(new URL('./checkout.html', import.meta.url), 'utf8')
    .replace('__STRIPE_PUBLISHABLE_KEY__', process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_MISSING');

app.get('/checkout', (req, res) => {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).send('Server misconfigured: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing');
  }
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
      metadata: { productId, quantity: String(qty) },
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error('create-payment-intent failed:', err?.message);
    res.status(500).json({ error: { message: 'Failed to create PaymentIntent' } });
  }
});

app.listen(port, () => {
  console.log(`ETORQUED checkout server (TEST MODE) on http://localhost:${port}`);
});
