# ETORQUED — Trading setup (age 16, Ireland)

Goal: make the storefront's income unambiguously **yours**, and correctly taxed in
your own name. Work through it in order; steps 1 and 2 are the ones that matter.

> Not legal, tax or accounting advice. Figures below were checked on
> **25 September 2026** and are listed with their sources at the bottom — confirm
> current numbers with Revenue, and spend one hour with an accountant before your
> first sale (step 9).

---

## The four records that decide whose income it is

There is no app, account or web page that "guarantees" attribution. Four records
decide it, and they all have to point at you:

1. **Who does the trade** — your work, your stock, your prices, your customers.
2. **Where the money lands** — an account in *your* name, with your own IBAN.
3. **What the customer paperwork says** — invoices and site pages naming *you* as
   the trader.
4. **Who files the return** — your PPSN, your return, declaring that profit.

If any one of those points at a parent or guardian, the default assumption flips
to them. That is the entire mechanism — nothing more complicated is going on.

---

## Step 1 — Get your own receiving account (the linchpin)

Everything else is paperwork; this is the one that actually determines who the
money legally belongs to.

- A 16–17 account with your **own Irish IBAN**. Both of these work:
  - **Revolut Independent Teen Account (16–17)** — own IBAN, able to receive income
    (Revolut's `<18` terms cover receiving money via payment link).
  - **Bank of Ireland 2nd Level Account (16–17)** — own IBAN; guardian consent
    needed for some features.
- Customer payments go **here**, never through a parent's account.
- Keep the statement: your name + IBAN on incoming payments is your cleanest
  evidence that the income is yours.

**Why this matters more than anything else:** an invoice in your name paid into a
guardian's account is the single move that turns your trading income into a
possible gift to or from them, and can raise gift-tax (CAT) questions. The
€3,000 small-gift exemption is not a substitute for earning income.

## Step 2 — Register for Income Tax with Revenue

- Sign in to **myAccount** (or ROS) → *Register for Income Tax* (self-assessment).
- You will need: PPSN, business commencement date, a NACE code for the activity,
  and your expected annual turnover.
- Revenue's own guidance confirms self-employed PRSI applies to people **aged 16
  to 66** with income of €5,000 or more — i.e. being 16 is squarely inside the
  system, not outside it. Revenue sets **no lower age limit for income tax**; it
  is based on income, not age.
- You will get a tax registration number and a Notice of Registration.
- **Also register for ROS** — it is how you file online later.
- *If myAccount blocks you on age:* phone Revenue and ask. There is no legal bar
  to registering as a self-employed 16-year-old, so this would be an operational
  problem to clear, not a refusal.

## Step 3 — Register the business name ETORQUED with the CRO

- Required because you are trading under a name that is not your own legal name.
- File the business name registration (form RBN1B) through CORE. Fee: **€20 online
  filing, €40 paper**. You provide the business name, the nature of the business,
  and the business address.
- This puts ETORQUED on the public register beside *your* name — exactly the
  "positioned towards me" evidence you are after.
- Register within **one month** of starting to trade under the name.

## Step 4 — Put the same identity on the website

- The legal pages currently read `[ADD REGISTERED COMPANY NAME]`,
  `[ADD REGISTERED ADDRESS]`, `[ADD VAT NUMBER OR CONFIRM NOT APPLICABLE]`.
  Replace them with your legal name, trading name, business address and support
  email.
- The trader named on the site must be the same trader on the Revenue registration
  and the CRO record. Mismatches between the site, the bank and Revenue are what
  create ambiguity later.
- This is also a legal requirement: a consumer buying from you must be able to
  identify who they are contracting with.
- If you add a separate bank account for Stripe payouts, its holder name must
  match the trader named here.

## Step 5 — Invoice every order in your own name

- Sequential invoice numbers (never reused, never skipped), your name + ETORQUED,
  the customer's name and address, the date, what was sold, the amount, and your
  VAT number once you are VAT-registered.
- The order reference the site already generates (`#ET-260925-71LU`) is a good
  anchor for tying an invoice to an order.
- Keep all records for **6 years**.

## Step 6 — Keep the money flow clean

- Business money in, business costs out — stock, shipping, card fees, the domain,
  the accountant — all through the same account.
- You are taxed on **net profit** (income minus allowable business expenses), not
  on gross turnover. Mixed personal spending is how people lose track and
  overpay.
- Do not route a customer payment through anyone else's account "just to be safe".

## Step 7 — File your first return (Form 11)

- Income earned in 2026 is declared by **31 October 2027** (mid-November if you
  file and pay through ROS).
- Expect income tax at your standard rate band plus **USC**, plus **Class S PRSI**
  once profit reaches €5,000.
- Your personal tax credit (and the earned-income credit, where applicable) reduces
  the bill — make sure they are claimed on the return.
- Preliminary tax (paying next year's tax in advance) can start applying from your
  second year; confirm the position when you file.

## Step 8 — Know your VAT trigger

- You do not need to register at the start. The trigger is turnover above
  **€85,000 for goods** or **€42,500 for services** in any 12 months.
- Selling to customers in other EU countries adds the EU-wide **€10,000** threshold
  for cross-border B2C sales, above which OSS rules apply.
- A couple of bikes a month keeps you far below these, but a good year reaches
  €85,000 quickly at €899–€1,499 per order — so revisit this as soon as you have a
  steady month.

## Step 9 — One accountant appointment

- Roughly €100–€250 for a consultation is the best money in this whole document.
- Ask them to confirm: sole trader is the right structure, your record-keeping
  layout, your preliminary-tax position, and — specifically — whether any
  arrangement where a guardian's account or Stripe account sits in the middle is
  acceptable, and how to document it.
- Also ask about the payment processor question: a guardian-owned Stripe account
  pays out to **the guardian's** bank account, which makes the merchant of record
  and the money theirs on paper. That is workable only with a written agreement
  (guardian acting on your behalf, funds belonging to your trade, no gifting) and
  an accountant's sign-off. Taking payment directly into your own account avoids
  the question entirely.

---

## Figures used above (checked 25 September 2026)

| Item | Value | Source |
| --- | --- | --- |
| Self-employed PRSI applies from | age 16 to 66, income ≥ €5,000 | Revenue — PRSI: do you need to pay |
| Class S PRSI rate | 4.2% until 30 Sep 2026, **4.35% from 1 Oct 2026** | Budget 2026 summary (KPMG) |
| Minimum Class S annual contribution | €650 | gov.ie — PRSI Class S rates |
| VAT registration threshold | €85,000 goods / €42,500 services | Revenue — VAT thresholds |
| EU cross-border B2C threshold | €10,000 | EU VAT rules (OSS) |
| CRO business name registration | €20 online / €40 paper | gov.ie / CRO |
| Stripe minimum age | 13 to create; under 18 needs a guardian as account owner | Stripe support — age requirement |
| Income tax filing deadline | 31 October following the tax year | Revenue |

**Where to check things yourself:** revenue.ie (registering for tax, VAT
thresholds, PRSI), cro.ie (business name registration),
citizensinformation.ie (self-employment, consumer rights).
