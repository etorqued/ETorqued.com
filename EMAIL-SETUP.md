# ETORQUED — Automated email setup (EmailJS)

The storefront sends email through EmailJS over its REST API. There is no
backend, no SDK and no build step — every order places two emails and every
support inquiry places one.

**Until the four IDs in `emailConfig` (top of `app.js`) are filled in, nothing
is emailed.** The customer still sees an order confirmation, plus a line asking
them to email `etorqued@gmail.com` with their reference so no order is ever
lost silently.

---

## 1. Account and service

1. Create an account at <https://www.emailjs.com> using **etorqued@gmail.com**.
2. Add an email service: **Gmail** → *Connect with Google* → sign in as
   **etorqued@gmail.com**. Emails will be sent *from* that address, so customer
   replies arrive in your normal inbox.
   *(Later, if you set up `hello@etorqued.com`, swap the service here — no code
   change is needed.)*
3. Copy the **Service ID**.

## 2. Templates

The free plan allows two templates, which is exactly what the site uses: one
order template (sent twice per order, once to you and once to the customer) and
one inquiry template.

> Variables are written `{{like_this}}`. Set each template's **To Email** field
> to `{{to_email}}` and **Reply To** to `{{reply_to}}` so replies route
> correctly in both directions.

### Template A — Orders

**Subject:** `{{role_headline}}`
**To Email:** `{{to_email}}` · **Reply To:** `{{reply_to}}`

```
{{role_intro}}

Order reference: {{order_reference}}
Order total: {{order_total}}

Items
-----
{{order_items}}

Customer
--------
{{customer_name}}
{{customer_email}}
{{customer_phone}}

Delivery
--------
{{address}}
{{postcode}}
Region: {{delivery_region}}
Estimated delivery: {{delivery_estimate}}

{{role_next_step}}

Support: {{support_email}}
```

Keep `{{order_items}}` on its own line — the site sends it as a multi-line
list of `Product — Variant × Qty — €total`.

### Template B — Support inquiries

**Subject:** `Support inquiry from {{name}}`
**To Email:** `{{to_email}}` · **Reply To:** `{{reply_to}}`

```
New support inquiry from {{name}} <{{email}}>

{{message}}

—
Submitted: {{submitted_at}}
Reply directly to this email to answer {{name}}.
```

## 3. Where the IDs go — `app.js`

```js
const emailConfig = {
  publicKey: 'XXXXXXXXXXXX',        // Account → General → Public key
  serviceId: 'service_xxxxxxx',     // Email Services → your Gmail service
  orderTemplateId: 'template_xxxxx',
  inquiryTemplateId: 'template_xxxxx'
};
```

## 4. Security and quota

- The public key is **designed** to be visible in the browser. Still lock it
  down: Account → Security → **allowed origins** → add your live domain(s), so
  nobody else can send through your account.
- Free plan: **200 emails/month** → 100 orders/month (2 emails each). Each
  support inquiry is 1.
- Never put a private key in `index.html` or `app.js`. That includes any Stripe
  secret key (`sk_live_…`, `sk_test_…`) — a Stripe Checkout integration needs a
  server-side function, not this file.

## 5. Testing

1. Paste the four IDs, save, reload the site.
2. Add a bike to the bag → Checkout → fill the form (use your own email as the
   customer address) → **Submit Order**.
3. You should get the merchant copy at `etorqued@gmail.com` and the customer
   copy at the address you typed.
4. Do the same from Support → **Send an inquiry**; the button only changes to
   *Inquiry Sent ✓* when the send actually succeeded.
5. If a send fails, the confirmation shows the manual fallback instead of
   pretending the email left.

## 6. What this does **not** do

- It does not create a server-side order record. The order is still saved in the
  customer's own browser (`localStorage`) — the emails are the real record.
- It does not take payments. The checkout still requests an invoice
  (Revolut / bank transfer). Stripe Checkout + webhooks is a separate project
  that needs a serverless function.
