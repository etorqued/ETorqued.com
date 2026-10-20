if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', () => {
  window.scrollTo(0, 0);
}, { once: true });

/* ── Email delivery (EmailJS) ────────────────────────────────────────────────
   The support inquiry form is emailed through EmailJS over its REST endpoint:
   no backend, no SDK, no build step. Setup steps are in
   _internal/EMAIL-SETUP.md and the branded HTML body is
   _internal/emails/support-inquiry.html. The whole _internal/ folder is kept
   out of the published site on purpose — GitHub Pages does not serve paths
   that start with an underscore.

   Card payment and order receipts are handled by Stripe’s own checkout, so the
   storefront no longer emails order confirmations.

   The values below are public identifiers and are meant to ship in this file.
   Restrict them to your domain in the EmailJS dashboard
   (Account → Security → allowed origins). Never place a private API key or a
   Stripe secret key here — anything in this file is visible to visitors.

   If inquiryTemplateId is ever emptied back to a placeholder nothing is emailed:
   the form says so and points the visitor at the support address.
   ──────────────────────────────────────────────────────────────────────── */
const SUPPORT_EMAIL = 'etorqued@gmail.com';
const emailConfig = {
  publicKey: 'WdonMZxgAoEmf-m_X',
  serviceId: 'service_z9moz9m',
  inquiryTemplateId: 'template_syi6di4'
};

/* ── Google Analytics, gated behind consent ──────────────────────────────────
   GA4 writes cookies to the visitor's device and routes the data to Google,
   so it is not loaded until the visitor has agreed to it. Nothing in this
   block contacts Google before that point: the loader script is injected only
   after consent is stored, and answering “no thanks” records the refusal so
   the banner stays away and the network stays silent.

   The choice is kept in localStorage under etorqued-analytics-consent and can
   be withdrawn from the Cookie Policy, which clears it and reloads the page.
   The measurement ID is a public identifier and is meant to ship in this file.
   ──────────────────────────────────────────────────────────────────────────── */
const analyticsMeasurementId = 'G-5H9EYQRZ47';
const ANALYTICS_CONSENT_KEY = 'etorqued-analytics-consent';
let analyticsStarted = false;
let analyticsHashListenerAttached = false;

function readAnalyticsConsent() {
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_KEY);
  } catch {
    return null; // Storage can be blocked entirely; treat that as no choice.
  }
}

function writeAnalyticsConsent(choice) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  } catch {
    // A refusal or acceptance we cannot remember still applies to this page load.
  }
}

function clearAnalyticsConsent() {
  try {
    localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
  expireAnalyticsCookies();
}

/* Google Analytics sets its cookies with an explicit domain attribute, so a
   write that omits the domain targets a different cookie and leaves the real
   one in place: the deletion looks like it worked while the cookie survives.
   Each name is therefore expired once per domain that could have been used —
   host-only, the current host and each of its parents — and an expiry aimed at
   a cookie that does not exist is simply ignored, so the extra writes cost
   nothing. Names matching _ga_ are swept up too, so changing the measurement
   ID never orphans a cookie. */
function expireAnalyticsCookies() {
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  const names = document.cookie.split(';').map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));

  const labels = location.hostname.split('.');
  const domains = [null]; // Host-only, which is what a plain write would set.
  for (let i = 0; i <= labels.length - 2; i += 1) {
    const domain = labels.slice(i).join('.');
    domains.push(domain, `.${domain}`);
  }

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = domain === null ? `${name}=; ${expired}` : `${name}=; ${expired}; domain=${domain}`;
    }
  }
}

function startAnalytics() {
  if (analyticsStarted || !analyticsMeasurementId) return;
  analyticsStarted = true;
  window.dataLayer = window.dataLayer || [];
  const gtag = function () { window.dataLayer.push(arguments); };
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', analyticsMeasurementId, { anonymize_ip: true, send_page_view: true });
  const loader = document.createElement('script');
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${analyticsMeasurementId}`;
  document.head.appendChild(loader);
  trackAnalyticsPageViewsOnHashChange(gtag);
}

/* The storefront is hash-routed, so a plain config only counts the first page.
   Every later hash change is sent as its own page view. */
function trackAnalyticsPageViewsOnHashChange(gtag) {
  if (analyticsHashListenerAttached) return;
  analyticsHashListenerAttached = true;
  window.addEventListener('hashchange', () => {
    gtag('event', 'page_view', { page_location: window.location.href, page_title: document.title });
  });
}

/* The actions worth counting are reported as the events GA4's own reports are
   built around: add_to_cart, begin_checkout, and generate_lead for a support
   inquiry. Nothing is sent unless Analytics is already running, which only
   happens once consent is in place — calling this never loads it by itself. */
function trackAnalyticsEvent(name, params) {
  if (!analyticsStarted || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

function checkoutEventParams(item) {
  return {
    currency: 'EUR',
    value: item.unitPrice * item.quantity,
    items: [{
      item_id: item.product.id,
      item_name: item.product.name,
      item_variant: getVariantLabel(item.variant),
      price: item.unitPrice,
      quantity: item.quantity
    }]
  };
}

/* ── Retry queue for failed sends ───────────────────────────────────────────
   There is no server here to catch a failed email, so a send that does not
   leave is written to localStorage and retried instead of being lost: shortly
   after every page load, when the browser comes back online, from the notice
   bar's "Retry now" button, and on a slow ticker while anything is pending.
   Retries back off (20s, 40s, 80s … capped at an hour) so a broken mail service
   is never hammered. The notice bar stays up until the message actually leaves,
   and the support form carries its own copy of the same state.
   ─────────────────────────────────────────────────────────────────────────── */
const EMAIL_QUEUE_KEY = 'etorqued-email-queue';
const EMAIL_QUEUE_LIMIT = 25;
const EMAIL_RETRY_BASE_MS = 20000;
const EMAIL_RETRY_MAX_MS = 3600000;
const EMAIL_QUEUE_TICK_MS = 10000;

let emailConfigWarned = false;
let emailFlushInFlight = false;
let emailQueueTicker = null;
let emailNoticeTimer = null;
let emailNoticeSentCount = 0;

function isEmailConfigured() {
  return Object.values(emailConfig).every((value) => !value.includes('[['));
}

// Talks to the EmailJS REST endpoint and never throws: callers get a plain
// result so a failed send can be queued instead of only logged.
async function postEmail(templateId, params) {
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: emailConfig.serviceId,
        template_id: templateId,
        user_id: emailConfig.publicKey,
        template_params: params
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn('EmailJS rejected a message:', response.status, detail);
      return { ok: false, reason: `${response.status} ${detail}`.trim() };
    }
    return { ok: true };
  } catch (error) {
    console.warn('EmailJS request failed:', error);
    return { ok: false, reason: String((error && error.message) || error) };
  }
}

function readEmailQueue() {
  try {
    const raw = localStorage.getItem(EMAIL_QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item) => item && item.templateId && item.params) : [];
  } catch (error) {
    console.warn('Could not read the pending email queue:', error);
    return [];
  }
}

function writeEmailQueue(list) {
  try {
    if (!list.length) {
      localStorage.removeItem(EMAIL_QUEUE_KEY);
      return true;
    }
    localStorage.setItem(EMAIL_QUEUE_KEY, JSON.stringify(list.slice(-EMAIL_QUEUE_LIMIT)));
    return true;
  } catch (error) {
    console.warn('Could not save the pending email queue:', error);
    return false;
  }
}

// A message is identified by who it goes to plus what it is, so a repeated
// failure of the same order email never stacks up as duplicate retries.
function emailQueueKey(templateId, params) {
  return [templateId, params.to_email || '', params.order_reference || '', params.role_eyebrow || params.submitted_at || ''].join('|');
}

function queueEmail(templateId, params) {
  const key = emailQueueKey(templateId, params);
  const queue = readEmailQueue();
  if (queue.some((item) => item.key === key)) return true;
  queue.push({ key, templateId, params, createdAt: Date.now(), attempts: 0, lastAttemptAt: Date.now() });
  const saved = writeEmailQueue(queue);
  if (saved) {
    console.info('ETORQUED: email queued for automatic retry.', { templateId, to: params.to_email });
    updateEmailQueueWork();
    syncEmailQueueNotice();
  }
  return saved;
}

function emailRetryDelayMs(attempts) {
  return Math.min(EMAIL_RETRY_BASE_MS * Math.pow(2, attempts), EMAIL_RETRY_MAX_MS);
}

// Sends everything that failed, oldest first. A manual retry ignores the back-
// off; automatic runs only touch items that are due, so an outage settles into
// an occasional background attempt until it works.
async function flushEmailQueue({ manual = false } = {}) {
  if (emailFlushInFlight || !isEmailConfigured()) return 0;
  const queue = readEmailQueue();
  if (!queue.length) {
    updateEmailQueueWork();
    return 0;
  }
  const now = Date.now();
  const due = queue.filter((item) => manual || !item.lastAttemptAt || now - item.lastAttemptAt >= emailRetryDelayMs(item.attempts || 0));
  if (!due.length) {
    syncEmailQueueNotice();
    return 0;
  }
  emailFlushInFlight = true;
  syncEmailQueueNotice({ sending: true });
  const pending = [];
  let sent = 0;
  for (const item of queue) {
    if (!due.includes(item)) {
      pending.push(item);
      continue;
    }
    const result = await postEmail(item.templateId, item.params);
    if (result.ok) {
      sent += 1;
    } else {
      pending.push({ ...item, attempts: (item.attempts || 0) + 1, lastAttemptAt: Date.now(), lastError: result.reason || '' });
    }
  }
  writeEmailQueue(pending);
  emailFlushInFlight = false;
  if (sent) {
    console.info(`ETORQUED: ${sent} queued email${sent === 1 ? '' : 's'} sent.`);
    emailNoticeSentCount = sent;
  }
  updateEmailQueueWork();
  syncEmailQueueNotice();
  return sent;
}

// The public helper used by the support inquiry form. It reports both
// outcomes: whether the message left now, and whether it is safely queued for a
// retry if it did not.
async function sendEmail(templateId, params) {
  if (!isEmailConfigured() || String(templateId).includes('[[')) {
    if (!emailConfigWarned) {
      emailConfigWarned = true;
      console.warn('EmailJS is not configured yet — orders and inquiries are not being emailed. See emailConfig in app.js.');
    }
    return { ok: false, queued: false, reason: 'not-configured' };
  }
  const result = await postEmail(templateId, params);
  if (result.ok) return { ok: true, queued: false };
  return { ok: false, queued: queueEmail(templateId, params), reason: result.reason };
}

function emailNoticeElements() {
  return {
    notice: document.querySelector('#emailQueue'),
    text: document.querySelector('#emailQueueText'),
    icon: document.querySelector('#emailQueueIcon'),
    action: document.querySelector('#emailQueueRetry')
  };
}

// An open modal (cart, legal pages …) already shows the state itself,
// and the bar must never sit on top of those controls.
function isPageOverlayOpen() {
  return Boolean(document.querySelector(
    '.modal-overlay.open, .modal-overlay.is-open, .modal-backdrop.open, .modal-backdrop.is-open, .legal-overlay.open, .legal-overlay.is-open, .mobile-menu-overlay.open, .mobile-menu-overlay.is-open'
  ));
}

function syncEmailQueueNotice({ sending = false } = {}) {
  const { notice, text, icon, action } = emailNoticeElements();
  if (!notice || !text || !icon || !action) return;
  const pending = readEmailQueue().length;
  clearTimeout(emailNoticeTimer);
  notice.classList.remove('is-sending', 'is-sent');
  if (isPageOverlayOpen()) {
    notice.hidden = true;
    return;
  }
  if (!pending) {
    action.hidden = true;
    if (emailNoticeSentCount) {
      const sent = emailNoticeSentCount;
      notice.hidden = false;
      notice.classList.add('is-sent');
      icon.textContent = '✓';
      text.textContent = sent === 1 ? 'Your email has been sent.' : `Your ${sent} emails have been sent.`;
      emailNoticeTimer = window.setTimeout(() => {
        emailNoticeSentCount = 0;
        notice.hidden = true;
      }, 6000);
      return;
    }
    notice.hidden = true;
    return;
  }
  emailNoticeSentCount = 0;
  notice.hidden = false;
  notice.classList.toggle('is-sending', sending);
  if (sending) {
    action.hidden = true;
    icon.textContent = '↻';
    text.textContent = `Sending ${pending === 1 ? 'your pending email' : `${pending} pending emails`}…`;
    return;
  }
  icon.textContent = '!';
  text.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = pending === 1 ? 'One email is still pending.' : `${pending} emails are still pending.`;
  text.append(strong, ` We’ll keep retrying automatically — you can also email ${SUPPORT_EMAIL}.`);
  action.hidden = false;
  action.disabled = false;
}

// Keeps a slow ticker alive only while something is actually waiting.
function updateEmailQueueWork() {
  if (readEmailQueue().length) {
    if (!emailQueueTicker) {
      emailQueueTicker = window.setInterval(() => {
        flushEmailQueue();
        syncEmailQueueNotice();
      }, EMAIL_QUEUE_TICK_MS);
    }
    return;
  }
  if (emailQueueTicker) {
    clearInterval(emailQueueTicker);
    emailQueueTicker = null;
  }
}

function initEmailQueue() {
  const { action } = emailNoticeElements();
  if (action) {
    action.addEventListener('click', () => {
      action.disabled = true;
      flushEmailQueue({ manual: true });
    });
  }
  // Overlays hide the bar, so re-check whenever one closes — a click or Escape
  // is handled after the overlay has swapped its class, and the transition end
  // catches animated closes either way. The ticker is the slow backstop.
  const nudgeEmailQueueNotice = () => {
    window.setTimeout(() => syncEmailQueueNotice(), 0);
    window.setTimeout(() => syncEmailQueueNotice(), 700);
  };
  document.addEventListener('click', nudgeEmailQueueNotice, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') nudgeEmailQueueNotice();
  }, true);
  document.addEventListener('transitionend', (event) => {
    const target = event.target;
    if (target instanceof Element && target.matches('.modal-overlay, .modal-backdrop, .legal-overlay, .mobile-menu-overlay')) nudgeEmailQueueNotice();
  }, true);
  updateEmailQueueWork();
  syncEmailQueueNotice();
  if (readEmailQueue().length) window.setTimeout(() => flushEmailQueue(), 1500);
}

window.addEventListener('online', () => flushEmailQueue());
window.addEventListener('focus', () => syncEmailQueueNotice());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  flushEmailQueue();
  syncEmailQueueNotice();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmailQueue, { once: true });
} else {
  initEmailQueue();
}

function setFormStatus(element, message, state = 'info') {
  if (!element) return;
  element.textContent = message;
  if (message) element.dataset.state = state;
  else delete element.dataset.state;
}

function isHoneypotFilled(form) {
  const trap = form.querySelector('[name="website"]');
  return Boolean(trap && trap.value.trim());
}

const products = [
  { id: 'apex-pro', paymentLink: 'https://buy.stripe.com/3cI4gy650dqaalW864bsc00', collection: 'bikes', name: 'ETQ APEX', image: 'assets/apex-14-12-new.png', alt: 'ETQ APEX electric dirt bike with 14/12 wheel setup', price: 899.99, color: '#263746', mark: 'A', stock: 3, conversionSpec: '3000W PEAK · 48V 23Ah · 14"/12"', tagline: 'Agile, lightweight electric performance tuned for instant throttle response and effortless urban handling.', microSubhead: 'Tuned for speed, control, and daily versatility.', riderFit: 'Optimized for riders 4\'11"–5\'10"', specSummary: ['3000W PEAK', '48V 23Ah', '14"/12"'], description: 'Agile, lightweight electric performance tuned for instant throttle response and effortless urban handling.', specs: ['Range', 'Up to 34 miles'], detail: 'Motor 3 kW', range: 'Up to 34 miles (approx. 55 km) per charge', rangeNote: 'Estimated range; terrain, rider weight, speed, temperature, and riding mode affect battery range.', peakPower: 'Up to 3,000W peak', battery: '48V 23Ah lithium battery', topSpeed: 'Up to 40 mph', chargeTime: 'Approximately 6 hours', weight: 'Approximately 121 lb (listed net weight)', seatHeight: '28.3"', recommendedHeight: '4\'11"–5\'10"', maxRiderWeight: 'Approximately 265 lb', wheels: '14" / 12" wheels', warranty: '1-year limited warranty', bestFor: ['Beginner riders', 'Daily urban riding', 'Lightweight or compact riders'], riderFitGuidance: 'A compact, agile choice for riders in the listed height range. Taller riders or riders prioritizing a full-size frame may prefer ETQ VORTEX.', useCases: ['Urban riding: responsive and easy to handle.', 'Commuting: quiet electric performance for daily trips.', 'Recreation: versatile riding for casual outings.', 'Trails: suitable for lighter trail use; confirm terrain limits before riding.', 'Off-road: choose ETQ VORTEX for more aggressive terrain.'] },
  { id: 'vortex-stealth', paymentLink: 'https://buy.stripe.com/eVq8wObpk71M51C2LKbsc01', collection: 'bikes', name: 'ETQ VORTEX', image: 'assets/vortex-17-14-new.jpg', alt: 'ETQ VORTEX electric dirt bike with 17/14 wheel setup', price: 1499.99, color: '#17191d', mark: 'V', stock: 5, conversionSpec: '6000W PEAK · 72V 25Ah · 17"/14"', tagline: 'Unleashed 6000W high-torque domination built for aggressive off-road terrain and max power delivery.', microSubhead: 'Raw power, full-size frame, and peak terrain control.', riderFit: 'Optimized for riders 5\'9"–6\'5"', specSummary: ['6000W PEAK', '72V 25Ah', '17"/14"'], description: 'Unleashed 6000W high-torque domination built for aggressive off-road terrain and max power delivery.', specs: ['Range', 'Up to 50 miles'], detail: 'Motor 6 kW', range: 'Up to 50 miles (approx. 80 km) per charge', rangeNote: 'Estimated range; terrain, rider weight, speed, temperature, and riding mode affect battery range.', peakPower: 'Up to 6,000W peak', battery: '72V 25Ah lithium-ion', topSpeed: 'Up to 53 mph', chargeTime: 'Approximately 7–8 hours', seatHeight: '31.9"', recommendedHeight: '5\'9"–6\'5"', maxRiderWeight: '287 lb', wheels: '17" / 14" wheels', warranty: '1-year limited warranty', bestFor: ['Aggressive off-road riding', 'Trail riding', 'Tall riders'], riderFitGuidance: 'A full-size, high-torque choice for riders in the listed height range and riders who want more off-road capability. Shorter or compact riders may find ETQ APEX easier to manage.', useCases: ['Urban riding: possible, but the full-size setup favors open riding.', 'Commuting: use only where the bike and route are permitted.', 'Recreation: suited to high-output recreational riding.', 'Trails: intended for stronger trail performance.', 'Off-road: the better fit for aggressive off-road use.'] },
  { id: 'apex-vented-front-plate', paymentLink: 'https://buy.stripe.com/4gMcN49hcfyieCcaecbsc03', collection: 'accessories', name: '"Apex" VENTED PLATE', image: 'assets/apex-vented-plate-front.png', gallery: ['assets/apex-vented-plate-front.png', 'assets/apex-vented-plate-side.png', 'assets/apex-vented-plate-angle.png'], alt: 'Gloss black Apex vented front plate', price: 22.99, color: '#242424', mark: 'A', stock: 8, description: 'High-gloss black cosmetic front plate with angular upper shield and lower mesh ventilation grid. Snap-on alternative to standard ODI plates.', features: ['High-gloss black cosmetic front plate', 'Angular upper shield with lower mesh ventilation grid', 'Snap-on alternative to standard ODI plates'], specs: ['Material', 'Gloss black plastic'], detail: 'Apex fitment' },
  { id: 'vortex-vented-front-plate', paymentLink: 'https://buy.stripe.com/9B600icto4TE9hS1HGbsc02', collection: 'accessories', name: '"Vortex" VENTED PLATE', image: 'assets/vortex-vented-plate-front.png', gallery: ['assets/vortex-vented-plate-front.png', 'assets/vortex-vented-plate-side.png', 'assets/vortex-vented-plate-angle.png'], alt: 'Gloss black Vortex vented front plate', price: 22.99, color: '#242424', mark: 'V', stock: 8, description: 'High-gloss black front plate featuring a curved top contour and wide diamond mesh grill. Lightweight snap-on aesthetic upgrade.', features: ['Curved top contour', 'Wide diamond mesh grill', 'Lightweight snap-on aesthetic upgrade'], specs: ['Material', 'Gloss black plastic'], detail: 'Vortex fitment' }
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const euro = (value) => `€${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const heroStartingPrice = document.querySelector('#heroStartingPrice');
if (heroStartingPrice) heroStartingPrice.textContent = euro(products.find((product) => product.collection === 'bikes')?.price || 0);
const compareProPrice = document.querySelector('#compareProPrice');
const compareBeastPrice = document.querySelector('#compareBeastPrice');
if (compareProPrice) compareProPrice.textContent = euro(products.find((product) => product.id === 'apex-pro')?.price || 0);
if (compareBeastPrice) compareBeastPrice.textContent = euro(products.find((product) => product.id === 'vortex-stealth')?.price || 0);
const bikeGrid = document.querySelector('#bikeGrid');
const accessoryGrid = document.querySelector('#accessoryGrid');
const productGrids = [bikeGrid, accessoryGrid];
const cartModal = document.querySelector('#cartModal');
const cartItems = document.querySelector('#cartItems');
const cartSubtotal = document.querySelector('#cartSubtotal');
const cart = [];
const previewModal = document.querySelector('#productPreviewModal');
const previewArt = document.querySelector('#previewArt');
const previewThumbnails = document.querySelector('#previewThumbnails');
const previewQuantity = document.querySelector('#previewQuantity');
let selectedQuantity = 1;
const bagCount = document.querySelector('#bagCount');
const navBagCount = document.querySelector('#navBagCount');
const cartToast = document.querySelector('#cartToast');
const mobileMenu = document.querySelector('#mobileMenu');
const mobileMenuButton = document.querySelector('#mobileMenuButton');
let cartToastTimer;
let cartToastHideTimer;
let selectedProduct = products[0];
let scrollLockCount = 0;
let currentScrollY = 0;
let previousBodyPaddingRight = '';
let previousBodyPosition = '';
let previousBodyTop = '';
let previousBodyWidth = '';
let previousBodyOverflow = '';
let selectedVariant = { frame: 'Stealth Black', battery: '60V Standard' };
const variantPricing = { '60V Standard': 0 };
const variantColors = { 'Stealth Black': '#17191d' };
// EU-only storefront: one delivery estimate for all 27 member states.
const euDeliveryEstimate = '7 Business Days';
const euCountries = ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'];
const countryDelivery = Object.fromEntries(euCountries.map((country) => [country, euDeliveryEstimate]));
const regionDelivery = { ...countryDelivery, 'United Kingdom (UK)': euDeliveryEstimate, 'United States (USA)': euDeliveryEstimate, 'European Union (EU)': euDeliveryEstimate };
const faqModal = document.querySelector('#faqModal');
const supportModal = document.querySelector('#supportModal');
const topNav = document.querySelector('.header-nav');
const heroSection = document.querySelector('.hero');
const legalPage = document.querySelector('#legalPage');
const legalPageTitle = document.querySelector('#legalPageTitle');
const legalPageKicker = document.querySelector('#legalPageKicker');
const legalPageUpdated = document.querySelector('#legalPageUpdated');
const legalPageNav = document.querySelector('#legalPageNav');
const legalPageBody = document.querySelector('#legalPageBody');
const legalBackButton = document.querySelector('#legalBackButton');
let lastFocusedElement = null;
let previewLoadingTimer;
let currentLegalSlug = '';
let legalCloseTimer;

const legalPages = [
  { slug: 'privacy-policy', title: 'Privacy Policy', description: 'How ETorqued handles personal information: the support form, Stripe payments, optional analytics, browser storage, and your data protection rights.', sections: [
    ['Information we collect', '<p>This storefront is a catalogue with a link out to Stripe for payment, so it holds very little information about you. There is no account system and no order form.</p><ul><li><b>Support inquiries.</b> When you use the Support form we receive the name, email address and message you type, together with the date and time. Those details are emailed to our support inbox and are not stored on this website.</li><li><b>Temporary retry storage.</b> If an inquiry email cannot be sent, the message is kept in your own browser so it can be retried automatically, and it is deleted once it has been sent.</li><li><b>Bag contents.</b> Your bag is held only in the memory of the page you are viewing. It is never stored on your device and never sent to us, and it empties when the page is reloaded or closed.</li><li><b>Your cookie choice.</b> If you answer the cookie banner, that answer is stored in your own browser so we can remember whether you agreed to analytics, and it is not sent to us.</li></ul><p>We never receive your full payment card details, because payment is completed on Stripe’s own site, and we do not use advertising identifiers, tracking pixels or advertising networks.</p>'],
    ['How we use information', '<p>We use the information described above only to:</p><ul><li>reply to your inquiry and answer product or order questions;</li><li>fulfil and deliver orders you place through Stripe, and keep the sales records we are legally required to keep;</li><li>operate the storefront, keep it secure, and diagnose faults.</li></ul><p>We do not sell your information and we do not use it for marketing without your permission. Where we rely on your consent you may withdraw it at any time, and where we rely on our legitimate interest in running and protecting the storefront you may object to that processing, as explained under your rights below.</p>'],
    ['Cookies and your browser', '<p>The storefront itself sets no cookies, and uses no advertising or tracking pixels. The only thing it always writes to your browser is a temporary retry record for an inquiry email that could not be sent: it holds the message you typed and is removed as soon as that message goes out.</p><p>Google Analytics is the one exception, and it is entirely optional. It is not loaded until you accept the cookie banner, so if you decline — or never answer — the storefront sets no cookies at all. See the <a href="#legal/cookie-policy">Cookie Policy</a> for the detail, including how to withdraw your choice later.</p>'],
    ['Analytics, and how to refuse it', '<p>This storefront uses <b>Google Analytics</b> to see how many people visit, which pages they look at, how long they stay and which actions they take — adding a bike to the bag, starting checkout or sending a support inquiry — so that we can see what is worth improving. Google sets two cookies on this site (<code>_ga</code> and <code>_ga_…</code>), and receives your IP address, browser details, the pages you viewed, the actions you took and when.</p><p><b>None of that happens unless you accept the cookie banner.</b> The analytics code is not loaded at all until you agree, and it is not loaded if you refuse. You can change your mind at any time from the <a href="#legal/cookie-policy">Cookie Policy</a>, and clearing your browser’s site data has the same effect. We only use the aggregated reports Google shows us; we do not use it to identify who you are, to build profiles about you, or to make automated decisions about you.</p>'],
    ['Payments and service providers', '<p>Checkout is handled entirely by Stripe. When you click a Buy now or checkout button you leave this storefront and pay on Stripe’s own secure page, which collects your card details, email address and delivery information under <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe’s own privacy policy</a>. We never see or store your card number. Stripe then tells us what was ordered and where to send it, so that we can deliver the order and keep the records we are required to keep.</p><p>The other providers involved are <b>Google Analytics</b> (United States), which measures use of the storefront and only if you accept the cookie banner; <b>EmailJS</b> (United States), which delivers the support-inquiry email and therefore receives your IP address, name, email address and message at the moment you submit the form; and <b>GitHub Pages</b> (United States), which hosts the site and records standard request logs including IP addresses in order to serve and protect it. Payments are processed by <b>Stripe Payments Europe, Ltd</b> (Ireland). Where these providers handle information in the United States they do so under the transfer safeguards they offer, such as standard contractual clauses.</p>'],
    ['Your rights', '<p>Because we hold very little about you, most requests are quick to answer. You have the right to ask for a copy of the information we hold about you, to have it corrected or deleted, to restrict or object to how we use it, and to receive it in a portable format. Where we rely on consent you can withdraw it at any time, without affecting anything done before you withdrew it.</p><p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> and we will respond within one month, although we may need to confirm your identity first. If you are not satisfied with our response you can complain to the Irish Data Protection Commission (<a href="https://www.dataprotection.ie" target="_blank" rel="noopener noreferrer">dataprotection.ie</a>) or to the supervisory authority in your own country.</p>'],
    ['Retention and security', '<p>Support inquiries are kept in our support inbox for up to 24 months so that we can deal with follow-up questions, and are then deleted. Order and accounting records supplied by Stripe are kept for six years, which is what Irish tax law requires. The retry record in your browser disappears as soon as the message is sent, and the contents of your bag are never stored at all.</p><p>Google keeps the usage data behind our analytics reports for <b>14 months</b> and then deletes it; we cannot retrieve anything beyond that window. Your cookie choice stays on your own device until you clear it.</p><p>This site is served over an encrypted HTTPS connection. Card details are entered only on Stripe’s servers and never reach this website, so no card data is held here. If we ever became aware of a breach affecting your information we would inform you and the Data Protection Commission, as the law requires.</p>'],
    ['Contact', '<p>For any privacy question or request, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>. Who we are, and our registered details, are set out on the <a href="#legal/company-information">Company Information</a> page.</p>']
  ]},
  { slug: 'cookie-policy', title: 'Cookie Policy', description: 'What the ETorqued storefront stores in your browser, the analytics cookies the banner controls, and how to withdraw your choice.', sections: [
    ['Cookies and similar storage', '<p>A cookie is a small file that a website asks your browser to store so that it can recognise you later. “Similar storage” covers technologies that keep data in your browser without involving a server at all, such as <i>localStorage</i>. Both matter when they identify you or follow you between sites.</p>'],
    ['Cookies we set', '<p>One, and only if you agree to it. Accepting the cookie banner lets Google Analytics set <code>_ga</code> and <code>_ga_…</code> on this site’s domain, so that a returning visitor is counted once rather than on every page. Declining, or simply ignoring the banner, sets neither one. Nothing else on this storefront writes a cookie, and your bag still lives only in the memory of the open page and disappears when you reload or close it.</p>'],
    ['What is stored in your browser', '<p>Two things, neither of which is sent to us unless you act. The first is your cookie choice, stored under the key <code>etorqued-analytics-consent</code> so the banner does not ask again. The second is a retry record: if a support-inquiry email fails to send — because you went offline, for example — the message is saved under the key <code>etorqued-email-queue</code> so it can be retried automatically. That record contains the name, email address and message you typed, it never leaves your device except to be emailed, and it is deleted as soon as the message is delivered. It is strictly necessary to provide the service you asked for, so it does not require consent, and clearing your browser’s site data removes both.</p>'],
    ['Third-party cookies', '<p>Google Analytics is the only third party able to set a cookie here, and it only does so if you accept the banner — its cookies are set on this site’s domain, not on Google’s. When you click through to pay you are on Stripe’s own site and Stripe applies its own cookies under its own privacy policy, and the same is true of the social link in our footer.</p>'],
    ['The cookie banner', '<p>The banner asks a single question, and we have answered it honestly: the analytics it controls are optional and the store works exactly the same either way. Choosing <i>Accept analytics</i> loads Google Analytics for that visit and remembers your choice. Choosing <i>No thanks</i> records the refusal, and nothing is sent to Google on that visit or any later one. Ignoring the banner does the same as refusing, because nothing loads until you agree.</p><p>To change your answer later, <a href="#" id="resetAnalyticsConsent">reset your cookie choice</a> — the choice is forgotten, any Google Analytics cookies are removed from your browser, and the banner asks again straight away.</p>'],
    ['Clearing what is stored', '<p>You can clear anything a site has stored in your browser at any time through your browser’s settings, usually under privacy or site data. Doing so removes the retry record described above, your cookie choice, and any Google Analytics cookies, so the banner will ask again next time. Blocking JavaScript or browser storage may stop the bag and the support form from working, because both need those features. Questions about any of this can go to <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>.</p>']
  ]},
  { slug: 'terms-and-conditions', title: 'Terms & Conditions', description: 'The terms that apply when you order from ETORQUED: orders and pricing, payment, delivery, product use, liability and how complaints are handled.', sections: [
    ['These terms', '<p>These terms apply when you order from the ETORQUED storefront, and by placing an order you agree to them. Nothing in them limits the rights you have as a consumer under the law that applies to you, and where these terms and your statutory rights conflict, your statutory rights take priority.</p>'],
    ['Eligibility and acceptable use', '<p>You must be able to enter a binding agreement under the rules that apply to you. Use the storefront lawfully, provide accurate order information, do not interfere with its operation, and do not misuse product, payment, or support systems.</p>'],
    ['Orders, pricing, and payment', '<p>Availability, descriptions and prices are shown on the storefront and can change before an order is placed. All prices are in euro (EUR). Payment is taken at checkout by card on Stripe’s secure page, and a contract is formed when we accept your order — the order confirmation and receipt Stripe emails you is our acceptance.</p><p>If we find an obvious pricing or description error before dispatch, we will contact you, and we may cancel and refund the order in full rather than charge you a corrected price without your agreement. Nothing here affects your right to cancel under the <a href="#legal/returns-and-refunds">Returns & Refunds Policy</a>.</p>'],
    ['Delivery', '<p>We ship only within the European Union, and dispatch and delivery times are set out in the <a href="#legal/shipping-policy">Shipping Policy</a>. Those timings are estimates, not guaranteed dates. Please give accurate delivery details and tell us promptly if anything changes, so the carrier can find you.</p>'],
    ['Product use and safety', '<p>Follow the product instructions, use appropriate protective equipment, inspect the bike before riding, and obey applicable road, land-access, age, and safety rules. Products must not be modified or used in a way that creates an unreasonable risk or defeats safety features. Refer to the supplied product documentation for model-specific guidance.</p>'],
    ['Intellectual property', '<p>ETorqued branding, product content, text, graphics, and storefront design belong to the business or its licensors unless stated otherwise. You may use the storefront for personal shopping purposes but may not copy, republish, or commercially exploit its content without permission.</p>'],
    ['Liability and complaints', '<p>We are responsible for loss you suffer that is a foreseeable result of our failing to meet these terms or of our negligence, but not for loss that was not foreseeable or that arises from your own misuse of a product. Nothing in these terms excludes liability that cannot be limited by law, and nothing reduces the remedies available to you where goods are faulty or not as described.</p><p>If something goes wrong, contact <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> first and we will try to put it right. If we cannot resolve it between us, you can raise it with your national consumer authority, or in Ireland with the Competition and Consumer Protection Commission (<a href="https://www.ccpc.ie" target="_blank" rel="noopener noreferrer">ccpc.ie</a>). These terms are governed by Irish law, without affecting any stronger protections you have where you live.</p>'],
    ['Changes to these terms', '<p>We may update these terms by publishing a revised version with a new date at the top of this page. A change applies only to orders placed after it is published, never to an order you have already placed.</p>']
  ]},
  { slug: 'warranty-policy', title: 'Warranty Policy', description: 'What the 1-year ETORQUED warranty covers, when it starts, what is excluded, how to make a claim, and how it sits alongside your statutory rights.', sections: [
    ['What is covered', '<p>Every ETORQUED bike and accessory carries a <b>1-year limited warranty</b> against manufacturing defects — a fault in materials or workmanship present when the item was made, rather than damage caused after delivery. That includes defects in the frame, battery, motor, controller and other electrical components, and it applies to the original purchaser named on the order.</p><p>Where a valid claim is accepted we <b>repair or replace</b> the affected part, and if neither repair nor replacement is possible we <b>refund</b> you. If the exact part is no longer available we will offer a remedy of equivalent value rather than leave you with a defective product.</p>'],
    ['When it starts and ends', '<p>The 1-year period starts on the date the product is delivered to you, not the date you ordered it. If we repair or replace a part under this warranty, cover continues to run from your original delivery date and is not extended by the repair.</p><p>This warranty is offered on top of your statutory rights and does not replace or shorten them. Nothing here reduces the remedies you have by law where goods are not in conformity with the contract, and those rights are not limited to 12 months.</p>'],
    ['What is not covered', '<p>This warranty does not cover:</p><ul><li><b>Normal wear and tear</b> — tyres, brake pads, chain, cables, bearings and similar consumable parts;</li><li><b>Cosmetic damage</b> that does not affect how the product works, such as scuffs and scratches;</li><li><b>Accident, crash or impact damage</b>, and damage from misuse or reckless riding;</li><li><b>Water or environmental damage</b> from riding, washing or storing the product in conditions the instructions warn against;</li><li><b>Unauthorised modification</b>, including aftermarket controllers, batteries or performance upgrades, or any attempt to defeat a speed or safety limit;</li><li><b>Incorrect assembly or unsuitable maintenance</b> after delivery, including repairs attempted without our instructions;</li><li><b>Use outside the supplied guidance</b>, or a product sold for private use being used commercially.</li></ul><p>These exclusions do not apply where the fault is a manufacturing defect, and they never limit your statutory rights.</p>'],
    ['Customer responsibilities', '<p>Use the bike as instructed, complete reasonable care and maintenance, stop using a product that appears unsafe, and keep records of relevant maintenance or communications. Do not attempt a repair that could create further damage unless instructed by ETorqued.</p>'],
    ['How to make a claim', '<p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> with your order reference, a description of the issue, photographs or video where useful, and the product serial number if available. Support may request additional information or an inspection before confirming the next step.</p>'],
    ['Proof of purchase', '<p>Keep your order confirmation, invoice, or other proof of purchase. A warranty claim may require this information to verify the product, purchase date, and purchaser.</p>']
  ]},
  { slug: 'returns-and-refunds', title: 'Returns & Refunds Policy', description: 'Your 14-day right to cancel an ETORQUED order, how to send an item back, when refunds are paid, and what happens with damaged or faulty goods.', sections: [
    ['Your 14-day right to cancel', '<p>As an EU consumer buying at a distance, you have the right to cancel your order within <b>14 days</b> of receiving it, without giving a reason. The 14 days run from the day you, or someone you nominated, physically receive the goods. To cancel, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> before those 14 days are up — an email saying that you are cancelling is enough, and you do not need to use any particular form.</p><p>This right applies to every product we currently sell. Nothing in this policy affects your statutory rights where goods are faulty, damaged or not as described.</p>'],
    ['Condition of returned items', '<p>You may handle and inspect the goods as you would in a shop, and you do not have to return them in the original packaging, but you are responsible for any loss in value caused by handling beyond what is necessary. Please return items complete, securely packaged, and with the order reference and any included parts or documents.</p><p>Where an item comes back damaged, used, or with parts missing, we may make a lawful deduction from the refund to reflect its reduced value.</p>'],
    ['How to send a return', '<p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> before sending anything back, with your order reference and the item you are returning, and we will reply with the return address and instructions. Please do not send goods to any other address.</p><p><b>Return postage is your responsibility and is not refunded</b> — except where the item was faulty, damaged in transit, or not what you ordered, in which case we cover it. Please use a tracked service and keep the receipt, because returned goods remain your responsibility until they reach us.</p>'],
    ['Refunds and timing', '<p>We refund within <b>14 days</b> of receiving your returned goods, or of you showing us that you sent them back — whichever comes first. We may hold a refund until the goods are back with us or we have proof of return. Refunds are paid through Stripe to the same payment method you used at checkout, and we do not charge a fee for making one.</p><p>We refund the price you paid for the goods plus our standard delivery cost. If you chose a more expensive delivery option than our standard one, we refund the standard cost only. Return postage is refunded only where the item was faulty, damaged, or incorrect.</p>'],
    ['Damaged, faulty, or incorrect items', '<p>Tell us as soon as you can, and photograph the packaging and the item if you are able to. Keep the packaging until we have advised you. Faulty, damaged or misdescribed goods are handled under your statutory rights and, where they apply, under the <a href="#legal/warranty-policy">Warranty Policy</a> — in those cases we cover the return postage and will replace, repair or refund the item.</p>'],
    ['Items that cannot be returned', '<p>None of the products we sell fall within the categories the law excludes from the right of withdrawal, such as goods made to your specification or sealed goods that have been unsealed for hygiene reasons. If that ever changes for a particular product, we will say so clearly on the product page before you order.</p>']
  ]},
  { slug: 'shipping-policy', title: 'Shipping Policy', description: 'Where ETORQUED delivers, how long dispatch and delivery take, that EU delivery is free, and what to do if a parcel is late or arrives damaged.', sections: [
    ['Where we deliver', '<p>ETORQUED ships exclusively within the European Union — all 27 member states. We do not accept orders from outside the EU, including the United Kingdom and the United States. If we cannot deliver to a particular address we will tell you before accepting the order, and you will pay nothing.</p>'],
    ['Dispatch times', '<p>Orders are prepared for dispatch within <b>2–4 business days</b> of being placed. Business days are Monday to Friday and exclude public holidays, and the clock starts when your order is confirmed. If anything you ordered turns out to be unavailable we will contact you before dispatch, and you may either wait or cancel that item for a full refund.</p>'],
    ['Delivery times', '<p>Estimated delivery is <b>7 business days</b> across the EU, counted from dispatch, so a typical order reaches you about 9–11 business days after you place it. Delivery times are estimates, not guaranteed dates, and can vary by destination, carrier, weather, and events outside our reasonable control.</p>'],
    ['Delivery charges', '<p>Delivery is free to every EU member state on every product we sell. There is no surcharge at checkout and no minimum order value.</p>'],
    ['Taxes and import charges', '<p>Because we sell only within the European Union, no customs duties, brokerage fees or import charges arise on any order. The price shown at checkout is the total price you pay: no VAT is added, because ETorqued is not registered for VAT, and there is nothing further to pay on delivery.</p>'],
    ['Tracking and late deliveries', '<p>Where the carrier provides tracking we send you the tracking details after dispatch. If tracking stops updating, or your parcel has not arrived within the estimated time, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> with your order reference and delivery country and we will chase it with the carrier.</p>'],
    ['Damaged deliveries', '<p>Inspect the package when practical and photograph visible damage before opening. Report damage promptly with photographs, packaging details, and the order reference. Keep the item and packaging available while the carrier or support team investigates.</p>']
  ]},
  { slug: 'contact-us', title: 'Contact Us', description: 'How to reach ETORQUED support about an order, delivery, warranty or return, and what to include so we can help quickly.', sections: [
    ['Customer support', '<p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> for product, delivery, invoice, warranty, returns, or order questions.</p>'],
    ['Response times', '<p>Email is the fastest way to reach us. We answer in the order messages arrive and aim to reply as soon as reasonably possible — as a small operation we do not publish fixed support hours, but inquiries are checked every business day.</p>'],
    ['Order support instructions', '<p>Include your order reference, full name, delivery country, and a concise description of the issue. For damaged or faulty items, include clear photographs and keep the packaging until the support team advises.</p>'],
    ['Contact form', '<p>For a direct request, use <a class="legal-contact-link" href="mailto:etorqued@gmail.com?subject=ETORQUED%20support%20request">Email customer support →</a>, or the inquiry form on the storefront Support page. That form emails our support inbox directly, and the name, email address and message you type are handled as described in the <a href="#legal/privacy-policy">Privacy Policy</a>.</p>']
  ]},
  { slug: 'company-information', title: 'Company Information', description: 'How to identify and contact ETorqued: legal and trading name, business address, support email and operating region.', sections: [
    ['Business identity', '<dl class="legal-details"><div><dt>Trading name</dt><dd>ETORQUED</dd></div><div><dt>Business address</dt><dd>29 Mill Race</dd></div><div><dt>Company registration number</dt><dd>Not applicable (sole trader)</dd></div><div><dt>VAT number</dt><dd>Not VAT registered</dd></div><div><dt>Support email</dt><dd><a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a></dd></div><div><dt>Operating region</dt><dd>European Union (EU-only shipping)</dd></div></dl>'],
    ['Customer support', '<p>For product and order support, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> with your order reference and delivery country. We aim to respond as soon as reasonably possible.</p>'],
    ['Why these details are published', '<p>These details are published so that you can identify and contact the trader behind ETORQUED before you place an order, as EU distance-selling rules require. If any of them change, this page is updated.</p><p>Nothing on this page limits your statutory consumer rights, and any complaint can be raised directly with <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>.</p>']
  ]}
];

function getLegalPage(slug) {
  return legalPages.find((page) => page.slug === slug);
}

function rememberFocus() {
  if (document.activeElement instanceof HTMLElement) lastFocusedElement = document.activeElement;
}

function restoreFocus() {
  if (lastFocusedElement?.isConnected) lastFocusedElement.focus({ preventScroll: true });
  lastFocusedElement = null;
}

function restoreFocusIfNoOverlay() {
  const overlays = [legalPage, faqModal, supportModal, previewModal, cartModal, mobileMenu];
  if (!overlays.some((overlay) => overlay && !overlay.hidden && !overlay.classList.contains('closing'))) restoreFocus();
}

function focusOverlayControl(selector) {
  document.querySelector(selector)?.focus({ preventScroll: true });
}

function finishPreviewLoading() {
  window.clearTimeout(previewLoadingTimer);
  const previewMedia = document.querySelector('.preview-main');
  if (!previewMedia) return;
  previewMedia.classList.remove('is-loading');
  previewMedia.setAttribute('aria-busy', 'false');
}

function startPreviewLoading() {
  const previewMedia = document.querySelector('.preview-main');
  if (!previewMedia) return;
  window.clearTimeout(previewLoadingTimer);
  previewMedia.classList.add('is-loading');
  previewMedia.setAttribute('aria-busy', 'true');
  const image = previewMedia.querySelector('img');
  if (image) {
    image.addEventListener('load', finishPreviewLoading, { once: true });
    image.addEventListener('error', finishPreviewLoading, { once: true });
  }
  // The current catalog uses generated product art; retain the same graceful fade
  // while allowing real product images to finish through their load event.
  previewLoadingTimer = window.setTimeout(finishPreviewLoading, image ? 1800 : 450);
}

function closeActiveOverlay() {
  const activeOverlays = [
    [legalPage, () => { window.location.hash = 'top'; }],
    [faqModal, () => closeInfoModal(faqModal)],
    [supportModal, () => closeInfoModal(supportModal)],
    [previewModal, closePreview],
    [cartModal, closeCart],
    [mobileMenu, closeMobileMenu]
  ];
  const activeOverlay = activeOverlays.find(([overlay]) => overlay && !overlay.hidden && !overlay.classList.contains('closing'));
  activeOverlay?.[1]();
}

function lockPageScroll() {
  if (scrollLockCount === 0) {
    currentScrollY = window.scrollY || window.pageYOffset || 0;
    previousBodyPaddingRight = document.body.style.paddingRight;
    previousBodyPosition = document.body.style.position;
    previousBodyTop = document.body.style.top;
    previousBodyWidth = document.body.style.width;
    previousBodyOverflow = document.body.style.overflow;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${currentScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
  }
  scrollLockCount += 1;
}

function unlockPageScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (!scrollLockCount) {
    document.body.style.position = previousBodyPosition;
    document.body.style.top = previousBodyTop;
    document.body.style.width = previousBodyWidth;
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
    document.body.classList.remove('modal-open');
    window.scrollTo({ top: currentScrollY, behavior: 'instant' });
  }
}

function openInfoModal(infoModal) {
  rememberFocus();
  infoModal.hidden = false;
  requestAnimationFrame(() => infoModal.classList.add('open'));
  focusOverlayControl(`#${infoModal.id} .modal-close`);
  lockPageScroll();
}

function closeInfoModal(infoModal) {
  if (infoModal.hidden || infoModal.classList.contains('closing')) return;
  infoModal.classList.add('closing');
  infoModal.classList.remove('open');
  window.setTimeout(() => {
    infoModal.classList.remove('closing');
    infoModal.hidden = true;
    unlockPageScroll();
    restoreFocusIfNoOverlay();
  }, 700);
}

function renderLegalPage(page) {
  legalPageTitle.textContent = page.title;
  legalPageKicker.textContent = `ETorqued / ${page.title}`;
  legalPageUpdated.textContent = 'Last updated: 12 October 2026';
  legalPageBody.innerHTML = page.sections.map(([heading, content], index) => `<section class="legal-section" aria-labelledby="legal-section-${index}"><h2 id="legal-section-${index}">${heading}</h2>${content}</section>`).join('');
  legalPageNav.innerHTML = legalPages.map((item) => `<a href="#legal/${item.slug}"${item.slug === page.slug ? ' aria-current="page"' : ''}>${item.title}</a>`).join('');
  document.title = `${page.title} — ETORQUED`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', page.description);
}

function closeLegalPage() {
  if (legalPage.hidden || legalPage.classList.contains('closing')) return;
  legalPage.classList.add('closing');
  legalPage.classList.remove('open');
  window.clearTimeout(legalCloseTimer);
  legalCloseTimer = window.setTimeout(() => {
    legalPage.classList.remove('closing');
    legalPage.hidden = true;
    unlockPageScroll();
    restoreFocusIfNoOverlay();
  }, 600);
}

function handleLegalRoute() {
  const slug = decodeURIComponent(window.location.hash.slice('#legal/'.length));
  const page = window.location.hash.startsWith('#legal/') ? getLegalPage(slug) : null;
  if (page) {
    const isOpening = legalPage.hidden;
    currentLegalSlug = page.slug;
    window.clearTimeout(legalCloseTimer);
    renderLegalPage(page);
    legalPage.hidden = false;
    legalPage.classList.remove('closing');
    if (isOpening) {
      rememberFocus();
      requestAnimationFrame(() => legalPage.classList.add('open'));
      lockPageScroll();
      legalPageBody.scrollTop = 0;
      focusOverlayControl('#legalBackButton');
    } else {
      legalPageBody.scrollTop = 0;
    }
    return;
  }
  if (currentLegalSlug) {
    currentLegalSlug = '';
    closeLegalPage();
    document.title = 'ETORQUED — High-performance electric dirt bikes';
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'ETORQUED high-performance electric dirt bikes — from €899,99. Instant electric torque, 1-year limited warranty, free EU-wide shipping.');
  }
}

function openMobileMenu() {
  if (!mobileMenu || !mobileMenu.hidden) return;
  rememberFocus();
  mobileMenu.hidden = false;
  mobileMenuButton.setAttribute('aria-expanded', 'true');
  mobileMenuButton.setAttribute('aria-label', 'Close navigation menu');
  requestAnimationFrame(() => mobileMenu.classList.add('open'));
  lockPageScroll();
}

function closeMobileMenu() {
  if (!mobileMenu || mobileMenu.hidden || mobileMenu.classList.contains('closing')) return;
  mobileMenu.classList.add('closing');
  mobileMenu.classList.remove('open');
  mobileMenuButton.setAttribute('aria-expanded', 'false');
  mobileMenuButton.setAttribute('aria-label', 'Open navigation menu');
  window.setTimeout(() => {
    mobileMenu.classList.remove('closing');
    mobileMenu.hidden = true;
    unlockPageScroll();
    restoreFocusIfNoOverlay();
  }, 700);
}

function scrollToCollection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const headerHeight = document.querySelector('.storefront-header')?.offsetHeight || 80;
  window.scrollTo({
    top: Math.max(0, target.offsetTop - headerHeight - 12),
    behavior: 'smooth'
  });
}

function returnHome(event) {
  event.preventDefault();
  [faqModal, supportModal, previewModal, cartModal].forEach((overlay) => {
    if (overlay && !overlay.hidden) {
      overlay.classList.remove('open', 'is-open', 'closing');
      overlay.hidden = true;
    }
  });
  if (mobileMenu && !mobileMenu.hidden) {
    mobileMenu.classList.remove('open', 'closing');
    mobileMenu.hidden = true;
    mobileMenuButton?.setAttribute('aria-expanded', 'false');
    mobileMenuButton?.setAttribute('aria-label', 'Open navigation menu');
  }
  if (legalPage && !legalPage.hidden) {
    legalPage.classList.remove('open', 'closing');
    legalPage.hidden = true;
    currentLegalSlug = '';
    document.title = 'ETORQUED — High-performance electric dirt bikes';
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'ETORQUED high-performance electric dirt bikes — from €899,99. Instant electric torque, 1-year limited warranty, free EU-wide shipping.');
  }
  scrollLockCount = 0;
  document.body.style.position = previousBodyPosition;
  document.body.style.top = previousBodyTop;
  document.body.style.width = previousBodyWidth;
  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPaddingRight;
  document.body.classList.remove('modal-open');
  const currentHash = window.location.hash;
  if (currentHash !== '#top') {
    window.history.replaceState(null, '', '#top');
  }
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  requestAnimationFrame(() => document.querySelector('#hero-title')?.focus({ preventScroll: true }));
}

let headerThemeQueued = false;
function updateHeaderTheme() {
  if (headerThemeQueued) return;
  headerThemeQueued = true;
  requestAnimationFrame(() => {
    headerThemeQueued = false;
    const threshold = Math.max(0, (heroSection?.offsetHeight || window.innerHeight) - 80);
    topNav?.classList.toggle('scrolled', window.scrollY > threshold);
  });
}

window.addEventListener('scroll', updateHeaderTheme, { passive: true });
window.addEventListener('resize', updateHeaderTheme, { passive: true });
updateHeaderTheme();

function renderProducts() {
  const renderCollection = (collection, grid) => {
    grid.innerHTML = products.filter((product) => product.collection === collection).map((product) => `
      <article class="product-card" data-reveal="card" data-product-id="${escapeHtml(product.id)}" tabindex="0" role="button" aria-label="View ${escapeHtml(product.name)}">
        <div class="product-visual product-visual--${escapeHtml(product.collection)}">${product.image ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.alt || product.name)}" loading="lazy" decoding="async">` : `<div class="product-art" style="--art:${escapeHtml(product.color)}" data-mark="${escapeHtml(product.mark)}"></div>`}</div>
        <div class="product-info"><div class="product-info-copy"><h3>${escapeHtml(product.name)}</h3>${product.conversionSpec ? `<span class="product-specs">${escapeHtml(product.conversionSpec)}</span>` : ''}<span class="product-stock">In stock</span></div><span class="product-price">${euro(product.price)}</span></div>
        <div class="product-actions">
          <button class="quick-add" type="button" data-quick-add="${escapeHtml(product.id)}">Quick Add to Bag <span aria-hidden="true">→</span></button>
          ${product.paymentLink ? `<a class="buy-now" href="/checkout?items=${encodeURIComponent(product.id)}:1" data-buy-now="${escapeHtml(product.id)}" aria-label="Buy ${escapeHtml(product.name)} now — goes to ETORQUED checkout">Buy Now <span aria-hidden="true">↗</span></a>` : ''}
        </div>
      </article>
    `).join('');
  };
  renderCollection('bikes', bikeGrid);
  renderCollection('accessories', accessoryGrid);
}

function getVariantPrice(product, variant = selectedVariant) {
  return product.price + (variantPricing[variant.battery] || 0);
}

function getVariantLabel(variant = selectedVariant) {
  return `${variant.frame} / ${variant.battery}`;
}

function renderBikeDetails(product) {
  const bikeDetails = document.querySelector('#previewBikeDetails');
  const bestFor = document.querySelector('#previewBestFor');
  const useCases = document.querySelector('#previewUseCases');
  const bikeSpecs = document.querySelector('#previewSpecs');
  const legalUse = document.querySelector('#previewLegalUse');
  const isBike = product.collection === 'bikes';
  bikeDetails.hidden = !isBike;
  // The off-road notice is about motor vehicles, so it never shows on a plate.
  if (legalUse) legalUse.hidden = !isBike;
  if (!isBike) return;

  document.querySelector('#previewRiderFitGuidance').textContent = product.riderFitGuidance;
  document.querySelector('#previewRange').textContent = product.range;
  document.querySelector('#previewRangeNote').textContent = product.rangeNote;
  bestFor.innerHTML = product.bestFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  useCases.innerHTML = product.useCases.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const specRows = [
    ['Peak power', product.peakPower],
    ['Battery', product.battery],
    ['Estimated top speed', product.topSpeed],
    ['Charge time', product.chargeTime],
    ['Bike weight', product.weight],
    ['Recommended rider height', product.recommendedHeight],
    ['Maximum rider / payload', product.maxRiderWeight],
    ['Wheels', product.wheels],
    ['Warranty', product.warranty]
  ];
  bikeSpecs.innerHTML = specRows.filter(([, value]) => value).map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join('');
  document.querySelector('#previewDelivery').textContent = 'Free EU-wide shipping · 7 business days';
}

function updatePreviewVariant() {
  const price = getVariantPrice(selectedProduct);
  document.querySelector('#previewPrice').textContent = euro(price);
  previewArt.style.setProperty('--art', selectedProduct.color);
  if (selectedProduct.image) previewArt.querySelector('img')?.setAttribute('alt', selectedProduct.alt || selectedProduct.name);
}

function openPreview(product) {
  selectedProduct = product;
  selectedQuantity = 1;
  selectedVariant = { frame: 'Stealth Black', battery: product.battery || '60V Standard' };
  const variantSelectors = document.querySelector('#variantSelectors');
  if (variantSelectors) variantSelectors.hidden = true;
  document.querySelector('#previewTitle').textContent = product.name;
  renderBikeDetails(product);
  document.querySelector('#previewPrice').textContent = euro(getVariantPrice(product));
  document.querySelector('#previewStock').textContent = 'In stock';
  document.querySelector('#previewDescription').textContent = product.description;
  const previewMicroSubhead = document.querySelector('#previewMicroSubhead');
  const previewRiderFit = document.querySelector('#previewRiderFit');
  previewMicroSubhead.textContent = product.microSubhead || '';
  previewMicroSubhead.hidden = !product.microSubhead;
  previewRiderFit.textContent = product.riderFit || '';
  previewRiderFit.hidden = !product.riderFit;
  if (product.collection !== 'bikes') {
    const specs = product.features || product.specSummary || [`${product.specs[0]}: ${product.specs[1]}`, `Detail: ${product.detail}`];
    document.querySelector('#previewSpecs').innerHTML = specs.map((spec) => `<li><span>${escapeHtml(spec)}</span></li>`).join('');
    document.querySelector('#previewDelivery').textContent = 'Free EU-wide shipping · 7 business days';
  }
 const previewBuyNow = document.querySelector('#previewBuyNow');
if (previewBuyNow) {
  previewBuyNow.hidden = false;
  previewBuyNow.href = `/checkout?items=${product.id}:1`;
}
  previewQuantity.value = selectedQuantity;
  previewArt.style.setProperty('--art', product.color);
  previewArt.dataset.mark = product.mark;
  previewArt.classList.toggle('has-image', Boolean(product.image));
  previewArt.innerHTML = product.image
    ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.alt || product.name)}" loading="lazy" decoding="async">`
    : `<div class="product-art" style="--art:${escapeHtml(product.color)}" data-mark="${escapeHtml(product.mark)}"></div>`;
  const previewMedia = previewArt.closest('.preview-main');
  if (previewMedia) previewMedia.classList.toggle('is-accessory', product.collection === 'accessories');
  updatePreviewVariant();
  const previewImages = product.gallery || (product.image ? [product.image] : []);
  previewThumbnails.innerHTML = previewImages.length
    ? previewImages.map((src, index) => `<button class="preview-thumbnail${index === 0 ? ' is-selected' : ''}" type="button" data-thumbnail-index="${index}" data-image-src="${escapeHtml(src)}" aria-label="View product image ${index + 1}"><img class="product-image" src="${escapeHtml(src)}" alt="${escapeHtml(product.alt || product.name)}"></button>`).join('')
    : [product.color, '#ffffff', '#dce6ed'].map((color, index) => `<button class="preview-thumbnail${index === 0 ? ' is-selected' : ''}" type="button" data-thumbnail-index="${index}" data-art-color="${escapeHtml(color)}" aria-label="View product image ${index + 1}"><span class="product-art" style="--art:${escapeHtml(color)}" data-mark="${escapeHtml(product.mark)}"></span></button>`).join('');
  previewModal.hidden = false;
  startPreviewLoading();
  requestAnimationFrame(() => previewModal.classList.add('open'));
  focusOverlayControl('#closePreview');
  lockPageScroll();
}

function closePreview() {
  if (previewModal.hidden || previewModal.classList.contains('closing')) return;
  previewModal.classList.add('closing');
  previewModal.classList.remove('open');
  window.setTimeout(() => {
    previewModal.classList.remove('closing');
    previewModal.hidden = true;
    unlockPageScroll();
    restoreFocusIfNoOverlay();
  }, 700);
}

function getCartCount() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

function updateBagBadge() {
  const count = String(getCartCount());
  bagCount.textContent = count;
  navBagCount.textContent = count;
  [bagCount, navBagCount].forEach((badge) => {
    badge.classList.remove('is-pulsing');
    requestAnimationFrame(() => badge.classList.add('is-pulsing'));
  });
  const label = getCartCount() ? `Open shopping bag with ${count} items` : 'Open shopping bag';
  document.querySelector('#navBagButton').setAttribute('aria-label', label);
}

// The one shared toast, used both for "Item added to Bag" and for the bag
// guardrail below. An error variant announces itself assertively and stays up
// long enough to read.
function showCartToast(message = 'Item added to Bag', { variant = 'info', duration = 2200 } = {}) {
  if (!cartToast) return;
  const isError = variant === 'error';
  // Both timers are cleared, not just the visible one: a stale hide step left
  // over from the previous toast would otherwise hide this one 300ms in.
  window.clearTimeout(cartToastTimer);
  window.clearTimeout(cartToastHideTimer);
  cartToast.textContent = message;
  cartToast.classList.toggle('is-error', isError);
  cartToast.setAttribute('role', isError ? 'alert' : 'status');
  cartToast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  cartToast.hidden = false;
  // Drop and re-apply the class across a forced reflow so the entrance
  // transition replays instead of being skipped on an already-shown toast.
  cartToast.classList.remove('is-visible');
  void cartToast.offsetWidth;
  cartToast.classList.add('is-visible');
  cartToastTimer = window.setTimeout(() => {
    cartToast.classList.remove('is-visible');
    cartToastHideTimer = window.setTimeout(() => { cartToast.hidden = true; }, 300);
  }, duration);
}

function cartTotal() {
  return cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

// The bag is a real cart: every checkout point hands the whole bag to the
// native ETORQUED checkout page, which prices the order on its own server.
function checkoutUrl(cartLines) {
  const payload = cartLines.map((item) => {
    const id = item.product ? item.product.id : item.id;
    const qty = item.quantity || 1;
    return `${id}:${qty}`;
  }).join(',');
  return `/checkout?items=${encodeURIComponent(payload)}`;
}

function goToCheckout() {
  if (!cart.length) return;
  trackAnalyticsEvent('begin_checkout', checkoutEventParams({
    product: cart[0].product, quantity: cart.reduce((count, item) => count + item.quantity, 0), variant: cart[0].variant, unitPrice: cart[0].unitPrice,
  }));
  window.location.href = checkoutUrl(cart);
}

function goToCheckoutSingle(product) {
  trackAnalyticsEvent('begin_checkout', checkoutEventParams({ product, quantity: 1, variant: selectedVariant, unitPrice: getVariantPrice(product, selectedVariant) }));
  window.location.href = checkoutUrl([{ product, quantity: 1 }]);
}

function renderCart(newVariantKey) {
  if (!cart.length) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    cartSubtotal.textContent = euro(0);
    return;
  }
  cartItems.innerHTML = cart.map((item, index) => `<article class="cart-item${item.variantKey === newVariantKey ? ' is-new' : ''}" data-cart-index="${index}">
    <div class="cart-item-visual${item.product.collection === 'accessories' ? ' accessory-lift' : ''}">${item.product.image ? `<img class="product-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.alt || item.product.name)}" decoding="async">` : `<div class="product-art" style="--art:${escapeHtml(variantColors[item.variant.frame] || item.product.color)}" data-mark="${escapeHtml(item.product.mark)}"></div>`}</div>
    <div class="cart-item-info"><h3>${escapeHtml(item.product.name)}</h3><p>${escapeHtml(getVariantLabel(item.variant))} · ${euro(item.unitPrice)} each</p>${item.product.paymentLink ? `<a class="cart-buy-now" href="/checkout?items=${encodeURIComponent(item.product.id)}:${item.quantity}" aria-label="Buy ${escapeHtml(item.product.name)} now — goes to ETORQUED checkout">Buy now <span aria-hidden="true">↗</span></a>` : ''}</div>
    <div class="cart-item-actions"><strong class="cart-item-total">${euro(item.unitPrice * item.quantity)}</strong><div class="cart-quantity"><button type="button" data-action="decrease" aria-label="Decrease ${item.product.name}">−</button><output>${item.quantity}</output><button type="button" data-action="increase" aria-label="Increase ${item.product.name}">+</button></div><button class="remove-item" type="button" data-action="remove">Remove</button></div>
  </article>`).join('');
  cartSubtotal.textContent = euro(cartTotal());
}

function flyToCart(product, sourceElement) {
  if (!sourceElement || !product.image || typeof sourceElement.animate !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const badge = navBagCount || bagCount;
  if (!badge) return;
  const start = sourceElement.getBoundingClientRect();
  const target = badge.getBoundingClientRect();
  if (!start.width || !target.width) return;
  const ghost = document.createElement('img');
  ghost.src = product.image;
  ghost.alt = '';
  ghost.className = 'fly-to-cart-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const size = Math.max(54, Math.min(110, Math.round(start.width * 0.42)));
  const startX = start.left + (start.width - size) / 2;
  const startY = start.top + (start.height - size) / 2;
  const endX = target.left + target.width / 2 - size / 2;
  const endY = target.top + target.height / 2 - size / 2;
  const midX = startX + (endX - startX) * 0.55;
  const midY = Math.min(startY, endY) - 70;
  const drift = startX > endX ? -18 : 18;
  ghost.style.width = `${size}px`;
  ghost.style.height = `${size}px`;
  document.body.appendChild(ghost);
  const animation = ghost.animate([
    { transform: `translate(${startX}px, ${startY}px) scale(1)`, opacity: 1 },
    { transform: `translate(${midX}px, ${midY}px) scale(.6)`, opacity: .95, offset: .6 },
    { transform: `translate(${endX + drift}px, ${endY}px) scale(.25)`, opacity: 0 }
  ], { duration: 620, easing: 'cubic-bezier(.3,.7,.4,1)' });
  animation.addEventListener('finish', () => ghost.remove(), { once: true });
  animation.addEventListener('cancel', () => ghost.remove(), { once: true });
}

function addToCart(product, quantity, variant = selectedVariant, options = {}) {
  const unitPrice = getVariantPrice(product, variant);
  const variantKey = `${product.id}-${variant.frame}-${variant.battery}`;
  const existing = cart.find((item) => item.variantKey === variantKey);
  if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
  else cart.push({ product, quantity, variant: { ...variant }, variantKey, unitPrice });
  updateBagBadge();
  renderCart(options.sourceElement ? variantKey : undefined);
  flyToCart(product, options.sourceElement);
  showCartToast();
  trackAnalyticsEvent('add_to_cart', checkoutEventParams({ product, quantity, variant, unitPrice }));
}

function openCart() {
  // The scroll lock is reference counted, so opening an already-open bag would
  // take a lock that the single close never releases.
  if (!cartModal.hidden || cartModal.classList.contains('closing')) return;
  renderCart();
  document.querySelector('#navBagButton').setAttribute('aria-expanded', 'true');
  rememberFocus();
  cartModal.hidden = false;
  requestAnimationFrame(() => cartModal.classList.add('open'));
  focusOverlayControl('#closeCart');
  lockPageScroll();
}

function closeCart() {
  if (cartModal.hidden || cartModal.classList.contains('closing')) return;
  document.querySelector('#navBagButton').setAttribute('aria-expanded', 'false');
  cartModal.classList.add('closing');
  cartModal.classList.remove('open');
  window.setTimeout(() => {
    cartModal.classList.remove('closing');
    cartModal.hidden = true;
    unlockPageScroll();
    restoreFocusIfNoOverlay();
  }, 700);
}

renderProducts();

const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

function quickAddToBag(product, sourceElement) {
  addToCart(product, 1, { frame: 'Stealth Black', battery: product.battery || '60V Standard' }, { sourceElement });
  window.setTimeout(openCart, 420);
}
productGrids.forEach((grid) => {
  grid.addEventListener('click', (event) => {
    // Intercept Buy Now clicks and redirect to native checkout page
    const buyNow = event.target.closest('.buy-now');
    if (buyNow) {
      event.preventDefault();
      const productId = buyNow.dataset.buyNow;
      if (productId) {
        window.location.href = `/checkout?items=${productId}:1`;
      }
      return;
    }
      return;
    }
    const quickAdd = event.target.closest('.quick-add');
    if (quickAdd) {
      event.preventDefault();
      event.stopPropagation();
      const product = products.find((item) => item.id === quickAdd.dataset.quickAdd);
      if (product) quickAddToBag(product, quickAdd);
      return;
    }
    const card = event.target.closest('.product-card');
    const product = products.find((item) => item.id === card?.dataset.productId);
    if (product) openPreview(product);
  });
  grid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('.buy-now')) return;
    const card = event.target.closest('.product-card');
    const product = products.find((item) => item.id === card?.dataset.productId);
    if (product) { event.preventDefault(); openPreview(product); }
  });
});
document.querySelector('#bagButton').addEventListener('click', openCart);
document.querySelector('#navBagButton').addEventListener('click', openCart);
document.querySelector('#closeCart').addEventListener('click', closeCart);
document.querySelector('#proceedToCheckout').addEventListener('click', goToCheckout);
cartItems.addEventListener('click', (event) => {
  const itemElement = event.target.closest('.cart-item');
  const item = itemElement ? cart[Number(itemElement.dataset.cartIndex)] : null;
  if (!item) return;
  if (event.target.closest('.cart-buy-now')) {
    event.preventDefault();
    window.location.href = `/checkout?items=${item.id}:${item.quantity || 1}`;
    return;
  }
});
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'increase') item.quantity = Math.min(10, item.quantity + 1);
  if (actionButton.dataset.action === 'decrease') item.quantity -= 1;
  if (actionButton.dataset.action === 'remove' || item.quantity <= 0) cart.splice(Number(itemElement.dataset.cartIndex), 1);
  updateBagBadge();
  renderCart();
});
document.querySelector('#closePreview').addEventListener('click', closePreview);
document.querySelector('#decreaseQuantity').addEventListener('click', () => {
  selectedQuantity = Math.max(1, selectedQuantity - 1);
  previewQuantity.value = selectedQuantity;
});  document.querySelector('#increaseQuantity').addEventListener('click', () => {
  selectedQuantity = Math.min(20, selectedQuantity + 1);
  previewQuantity.value = selectedQuantity;
});
previewThumbnails.addEventListener('click', (event) => {
  const thumbnail = event.target.closest('.preview-thumbnail');
  if (!thumbnail) return;
  document.querySelectorAll('.preview-thumbnail').forEach((item) => item.classList.remove('is-selected'));
  thumbnail.classList.add('is-selected');
  if (thumbnail.dataset.imageSrc) {
    previewArt.classList.add('has-image');
    previewArt.innerHTML = `<img class="product-image" src="${escapeHtml(thumbnail.dataset.imageSrc)}" alt="${escapeHtml(selectedProduct.alt || selectedProduct.name)}">`;
  } else {
    previewArt.classList.remove('has-image');
    previewArt.style.setProperty('--art', thumbnail.dataset.artColor);
  }
});
document.querySelector('#addToCartButton').addEventListener('click', () => {
  addToCart(selectedProduct, selectedQuantity, selectedVariant, { sourceElement: document.querySelector('#addToCartButton') });
  closePreview();
});
document.querySelector('#previewCompareLink').addEventListener('click', () => {
  const otherBike = products.find((product) => product.collection === 'bikes' && product.id !== selectedProduct.id);
  if (!otherBike) return;
  closePreview();
  window.setTimeout(() => openPreview(otherBike), 720);
});
previewModal.addEventListener('click', (event) => { if (event.target === previewModal) closePreview(); });
cartModal.addEventListener('click', (event) => { if (event.target === cartModal) closeCart(); });
document.querySelectorAll('[data-home-link]').forEach((link) => link.addEventListener('click', returnHome));
legalBackButton.addEventListener('click', () => {
  window.location.hash = 'top';
});
window.addEventListener('hashchange', handleLegalRoute);
handleLegalRoute();

document.addEventListener('keydown', (event) => {
  // `KeyE` is the physical E key; Escape is intentionally checked by key/code.
  if (event.key !== 'Escape' && event.code !== 'Escape') return;
  event.preventDefault();
  closeActiveOverlay();
});

document.querySelector('#searchButton').addEventListener('click', () => {
  scrollToCollection('bikes-collection');
});
document.querySelector('#heroScrollButton').addEventListener('click', () => {
  scrollToCollection('bikes-collection');
});
document.querySelectorAll('[data-scroll-target]').forEach((button) => {
  button.addEventListener('click', () => scrollToCollection(button.dataset.scrollTarget));
});
document.querySelector('#faqButton').addEventListener('click', () => openInfoModal(faqModal));
document.querySelector('#supportButton').addEventListener('click', () => openInfoModal(supportModal));
mobileMenuButton.addEventListener('click', () => {
  if (mobileMenu.hidden) openMobileMenu();
  else closeMobileMenu();
});
mobileMenu.querySelectorAll('[data-scroll-target]').forEach((button) => {
  button.addEventListener('click', closeMobileMenu);
});
document.querySelector('#mobileFaqButton').addEventListener('click', () => {
  closeMobileMenu();
  openInfoModal(faqModal);
});
document.querySelector('#mobileSupportButton').addEventListener('click', () => {
  closeMobileMenu();
  openInfoModal(supportModal);
});
mobileMenu.addEventListener('click', (event) => {
  if (event.target === mobileMenu) closeMobileMenu();
});
document.querySelectorAll('[data-close-info]').forEach((button) => {
  button.addEventListener('click', () => closeInfoModal(document.getElementById(button.dataset.closeInfo)));
});
[faqModal, supportModal].forEach((infoModal) => {
  infoModal.addEventListener('click', (event) => {
    if (event.target === infoModal) closeInfoModal(infoModal);
  });
});

const accordionCloseTimers = new WeakMap();
document.querySelectorAll('.info-accordion details').forEach((details) => {
  const summary = details.querySelector('summary');
  if (!summary) return;

  summary.addEventListener('click', (event) => {
    event.preventDefault();
    window.clearTimeout(accordionCloseTimers.get(details));

    if (details.classList.contains('is-open')) {
      details.classList.remove('is-open');
      accordionCloseTimers.set(details, window.setTimeout(() => {
        if (!details.classList.contains('is-open')) details.open = false;
      }, 700));
      return;
    }

    details.open = true;
    details.classList.add('is-open');
  });
});
document.querySelector('#supportInquiryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.sending === 'true') return;
  if (isHoneypotFilled(form)) return;
  const submitButton = form.querySelector('button[type="submit"]');
  const inquiryStatus = document.querySelector('#inquiryStatus');
  const originalLabel = submitButton.innerHTML;
  const fields = Object.fromEntries(new FormData(form));

  form.dataset.sending = 'true';
  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';
  setFormStatus(inquiryStatus, 'Sending your inquiry…');

  const inquiryResult = await sendEmail(emailConfig.inquiryTemplateId, {
    to_email: SUPPORT_EMAIL,
    to_name: 'ETORQUED',
    reply_to: fields.supportEmail,
    name: fields.supportName,
    email: fields.supportEmail,
    message: fields.supportMessage,
    support_email: SUPPORT_EMAIL,
    site_url: 'https://etorqued.com',
    year: String(new Date().getUTCFullYear()),
    submitted_at: new Date().toUTCString()
  });

  form.dataset.sending = 'false';
  submitButton.disabled = false;
  if (inquiryResult.ok) {
    trackAnalyticsEvent('generate_lead', { form: 'support_inquiry' });
    submitButton.innerHTML = 'Inquiry Sent <span>✓</span>';
    form.reset();
    setFormStatus(inquiryStatus, `Thanks — your message is on its way. We’ll reply to ${fields.supportEmail}.`);
  } else if (inquiryResult.queued) {
    trackAnalyticsEvent('support_inquiry_queued', { form: 'support_inquiry' });
    submitButton.innerHTML = originalLabel;
    setFormStatus(inquiryStatus, `We couldn’t reach the mail service just now — your message is saved and we’ll keep retrying automatically. If it’s urgent, email ${SUPPORT_EMAIL} directly.`, 'warning');
  } else {
    submitButton.innerHTML = originalLabel;
    setFormStatus(inquiryStatus, `We couldn’t send that automatically. Email ${SUPPORT_EMAIL} directly and we’ll pick it up.`);
  }
});

/* ── Cookie consent banner ──────────────────────────────────────────────────
   The banner is the switch that decides whether analytics loads at all, so it
   appears only when no choice has been stored yet. Accepting starts GA4 on the
   spot; declining keeps it off and remembers that, so the bar never returns.
   Withdrawing consent is handled from the Cookie Policy, which clears the
   stored choice and reloads so nothing from Google survives the change.
   ─────────────────────────────────────────────────────────────────────────── */
const cookieBanner = document.querySelector('#cookieBanner');
const cookieAcceptButton = document.querySelector('#cookieAccept');
const cookieDeclineButton = document.querySelector('#cookieDecline');

function hideCookieBanner() {
  if (cookieBanner) cookieBanner.hidden = true;
  syncCookieBannerOffset();
}

/* The banner is fixed to the bottom of the viewport, so anything else anchored
   there sits underneath it — the open bag hid its payment badges behind it. Its
   measured height is published as a custom property that the stylesheet offsets
   those elements by, and it is 0 when no banner is up, so every offset
   collapses on its own. */
function syncCookieBannerOffset() {
  const height = cookieBanner && !cookieBanner.hidden ? Math.round(cookieBanner.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--cookie-banner-h', `${height}px`);
}

window.addEventListener('resize', syncCookieBannerOffset);
// The banner's height also changes without a window resize — when the copy
// rewraps, or when a web font swaps in after load — so it is watched directly
// rather than measured once. Hiding it collapses the same property to 0.
if (cookieBanner && typeof ResizeObserver === 'function') {
  new ResizeObserver(syncCookieBannerOffset).observe(cookieBanner);
}

if (cookieBanner) {
  const storedConsent = readAnalyticsConsent();
  if (storedConsent === 'accepted') {
    hideCookieBanner();
    startAnalytics();
  } else {
    // Without consent nothing from Google may be loaded or left behind, so any
    // cookie an earlier acceptance set is cleared on this load as well as at the
    // moment of withdrawal. Clearing it here is what makes the withdrawal stick:
    // when the reset link is clicked Analytics is still running and can write a
    // fresh cookie immediately after that deletion, and this load is the first
    // point at which nothing can recreate it.
    expireAnalyticsCookies();
    if (storedConsent === 'declined') {
      hideCookieBanner();
    } else {
      cookieBanner.hidden = false;
      syncCookieBannerOffset();
    }
  }

  cookieAcceptButton?.addEventListener('click', () => {
    writeAnalyticsConsent('accepted');
    startAnalytics();
    hideCookieBanner();
  });

  cookieDeclineButton?.addEventListener('click', () => {
    writeAnalyticsConsent('declined');
    hideCookieBanner();
  });
}

/* “Change your mind” on the Cookie Policy: forget the choice and reload so the
   analytics cookies go with it. The link lives in legal-page content that is
   rendered lazily into #legalPageBody, so it does not exist when this script
   runs and a direct query only finds it on a page loaded straight at that URL.
   The handler is therefore delegated to the document. */
document.addEventListener('click', (event) => {
  const resetLink = event.target instanceof Element ? event.target.closest('#resetAnalyticsConsent') : null;
  if (!resetLink) return;
  event.preventDefault();
  clearAnalyticsConsent();
  window.location.reload();
});

