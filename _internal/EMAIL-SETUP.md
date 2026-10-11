# ETORQUED — Automated email setup (EmailJS)

The storefront sends email through EmailJS over its REST API. There is no
backend, no SDK and no build step — every order places **two** emails (one to
you, one to the customer) and every support inquiry places one.

The email bodies are **branded HTML that matches the storefront** (black header,
cyan accent, Barlow Condensed headlines, `€1.234,56 EUR` prices). They live in:

- `emails/order-confirmation.html` — the order email (sent to both of us)
- `emails/support-inquiry.html` — the support inquiry email

Open `email-preview.html` (from the local server or the live site) to see both
rendered with a sample order.

> **Status:** the four IDs in `emailConfig` (top of `app.js`) are filled in, so
> ordering is live. The order template sends (verified against the EmailJS API),
> but the support-inquiry template ID currently returns *"The template ID not
> found"*. Those inquiries are queued and retried, and the form also tells the
> sender to email you directly if it is urgent. Fix: create Template B in §3,
> then put its real ID in `emailConfig.inquiryTemplateId` — the queued messages
> then go out by themselves (see §7).
>
> If any ID is ever blanked back to a `[[…]]` placeholder, nothing is emailed:
> the customer still sees an order confirmation, plus a line asking them to email
> `etorqued@gmail.com` with their reference, so no order is lost silently.

---

## 1. Start fresh — clear anything already there

The site code has never held a real template ID (only `[[...]]` placeholders),
so **there is nothing to remove in this repo**. Anything to delete lives in your
EmailJS account:

1. Sign in at <https://dashboard.emailjs.com> as **etorqued@gmail.com**
   (the account you have open in Opera).
2. **Email Templates** in the left sidebar.
3. For **every** template listed — old ones included — click the **⋮** /
   overflow menu on the template card → **Delete** → confirm.
4. Do the same under **Email Services** only if you have a stale/broken service:
   delete it and re-add Gmail in step 2 below.

You should finish with **zero templates**, then build the two in §3.

## 2. Account and service

1. **Email Services** → **Add New Service** → **Gmail** → *Connect with Google*
   → sign in as **etorqued@gmail.com**. Emails are sent *from* that address, so
   customer replies arrive in your normal inbox.
   *(Later, if you set up `hello@etorqued.com`, swap the service here — no code
   change is needed.)*
2. Copy the **Service ID** (looks like `service_xxxxxxx`).
3. **Account → General** → copy the **Public Key**.

## 3. The two templates

The free plan allows two templates, which is exactly what this uses: one order
template (sent twice, once to you and once to the customer) and one inquiry
template.

> In each template, open the **Content** tab and switch to the HTML/code view
> before pasting — the body is HTML, not plain text.

### Template A — Orders

**Subject:** `{{role_subject}}`
**To Email:** `{{to_email}}` · **Reply To:** `{{reply_to}}`

**Content:** open `emails/order-confirmation.html`, select all, copy, and paste
the whole file in. Then click **Save**.

The same template is used for both recipients; the site fills `role_subject`,
`role_eyebrow`, `role_headline`, `role_intro`, `role_next_step`,
`role_button_label` and `role_button_url` differently for your copy and the
customer's copy.

### Template B — Support inquiries

**Subject:** `Support inquiry from {{name}}`
**To Email:** `{{to_email}}` · **Reply To:** `{{reply_to}}`

**Content:** paste all of `emails/support-inquiry.html`. Then click **Save**.

## 4. Where the IDs go — `app.js`

```js
const emailConfig = {
  publicKey: 'WdonMZxgAoEmf-m_X',    // Account → General → Public key
  serviceId: 'service_z9moz9m',      // Email Services → your Gmail service
  orderTemplateId: 'template_6f4ydtb', // Template A — live
  inquiryTemplateId: 'template_syi6di4' // Template B — ID not found, re-create
};
```

Every `{{variable}}` in both templates is filled in automatically by the site —
you never type values into the dashboard. For reference, the order email sends:

| Group | Variables |
| --- | --- |
| Recipient (set per send) | `to_email`, `to_name`, `reply_to` |
| Wording (set per send) | `role_subject`, `role_preheader`, `role_eyebrow`, `role_headline`, `role_intro`, `role_next_step`, `role_button_label`, `role_button_url` |
| Order | `order_reference`, `order_date`, `order_total`, `order_item_count`, `order_items`, `order_items_html` |
| Customer | `customer_name`, `customer_email`, `customer_phone` |
| Delivery | `address`, `postcode`, `delivery_region`, `delivery_estimate` |
| Footer / status | `payment_note`, `support_email`, `site_url`, `year` |

Keep `{{order_items_html}}` as the only thing inside the items `<table>` — the
site sends it as ready-made `<tr>` rows. `{{order_items}}` is the plain-text
version, used by the manual fallback link.

## 5. Security and quota

- The public key is **designed** to be visible in the browser. Still lock it
  down: **Account → Security → allowed origins** → add your live domain(s), so
  nobody else can send through your account.
- Free plan: **200 emails/month** → 100 orders/month (2 emails each). Each
  support inquiry is 1.
- Never put a private key in `index.html` or `app.js`. That includes any Stripe
  secret key (`sk_live_…`, `sk_test_…`) — a Stripe Checkout integration needs a
  server-side function, not this file.

## 6. Testing

1. Confirm the four IDs in `emailConfig` are correct, save, reload the site.
2. Lock the key down under **Account → Security → allowed origins** (see §5).
3. In each template's editor, use **Test it** to fire one at yourself and check
   the branding renders (Gmail strips web fonts, so headlines fall back to
   Arial Narrow — that is expected and looks correct).
3. Add a bike to the bag → Checkout → fill the form (use your own email as the
   customer address) → **Continue to Review** → **Reserve Unit — No Payment
   Taken**.
4. You should get the merchant copy at `etorqued@gmail.com` and the customer
   copy at the address you typed.
5. Do the same from Support → **Send an inquiry**; the button only changes to
   *Inquiry Sent ✓* when the send actually succeeded.
6. If a send fails, the confirmation shows the manual fallback instead of
   pretending the email left.

## 7. If a send fails — the retry queue

A failed send is never dropped. `sendEmail()` in `app.js` writes it to
`localStorage['etorqued-email-queue']` and the site retries it:

- about 1.5 seconds after the next page load,
- when the browser comes back online, when the tab regains focus, and on a
  10-second ticker while anything is waiting,
- from the **Retry now** button on the notice bar.

Retries back off (20s, 40s, 80s … capped at an hour) so a broken mail service is
never hammered, and the queue holds at most 25 messages. The notice bar stays on
screen until the message actually leaves and then reports *sent*; while a modal
is open (checkout, cart, legal pages) the bar hides itself, because that screen
carries the same message inline. `sendEmail()` returns `{ ok, queued }`, so the
support form only claims *Inquiry Sent ✓* when the message really left —
otherwise it says the message is saved and still being retried.

Two things to know:

- The queue lives in the customer's own browser, so it is only as durable as
  that browser's storage. Clearing site data drops it.
- It holds the message body, which includes the customer's name, email, phone and
  delivery address — the same data the local order record already keeps. The
  entry is deleted as soon as the message is sent.

To test it: open DevTools → Network → **Offline**, place an order, and watch the
notice bar appear; go back online and it sends by itself.

## 8. What this does **not** do

- It does not create a server-side order record. The order is still saved in the
  customer's own browser (`localStorage`) — the emails are the real record — and
  a queued retry therefore only runs while that browser is on the site.
- It does not take payments. The checkout still requests an invoice
  (Revolut / bank transfer). Stripe Checkout + webhooks is a separate project
  that needs a serverless function.
