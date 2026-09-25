if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', () => {
  window.scrollTo(0, 0);
}, { once: true });

/* ── Email delivery (EmailJS) ────────────────────────────────────────────────
   Order confirmations and support inquiries are emailed through EmailJS over
   its REST endpoint: no backend, no SDK, no build step. Setup steps and the
   exact template bodies are documented in EMAIL-SETUP.md.

   The four values below are public identifiers and are meant to ship in this
   file. Restrict them to your domain in the EmailJS dashboard
   (Account → Security → allowed origins). Never place a private API key or a
   Stripe secret key here — anything in this file is visible to visitors.

   Until the placeholders are replaced nothing is emailed: the confirmation
   still appears, with a manual fallback telling the customer to email us
   directly and quote their reference.
   ─────────────────────────────────────────────────────────────────────────── */
const SUPPORT_EMAIL = 'etorqued@gmail.com';
const emailConfig = {
  publicKey: '[[EMAILJS PUBLIC KEY]]',
  serviceId: '[[EMAILJS SERVICE ID]]',
  orderTemplateId: '[[EMAILJS ORDER TEMPLATE ID]]',
  inquiryTemplateId: '[[EMAILJS INQUIRY TEMPLATE ID]]'
};

let emailConfigWarned = false;

function isEmailConfigured() {
  return Object.values(emailConfig).every((value) => !value.includes('[['));
}

async function sendEmail(templateId, params) {
  if (!isEmailConfigured() || String(templateId).includes('[[')) {
    if (!emailConfigWarned) {
      emailConfigWarned = true;
      console.warn('EmailJS is not configured yet — orders and inquiries are not being emailed. See emailConfig in app.js.');
    }
    return false;
  }
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
      console.warn('EmailJS rejected a message:', response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (error) {
    console.warn('EmailJS request failed:', error);
    return false;
  }
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
  { id: 'apex-pro', collection: 'bikes', name: 'ETQ APEX', image: 'assets/apex-14-12-new.png', alt: 'ETQ APEX electric dirt bike with 14/12 wheel setup', price: 899.99, color: '#263746', mark: 'A', stock: 3, conversionSpec: '⚡ 3000W PEAK • 🔋 48V 23Ah • 🛞 14"/12" • 📏 28.3" SEAT', tagline: 'Agile, lightweight electric performance tuned for instant throttle response and effortless urban handling.', microSubhead: 'Tuned for speed, control, and daily versatility.', riderFit: 'Optimized for riders 4\'11"–5\'10"', specSummary: ['⚡ 3000W PEAK', '🔋 48V 23Ah', '🛞 14"/12"', '📏 28.3" SEAT'], description: 'Agile, lightweight electric performance tuned for instant throttle response and effortless urban handling.', specs: ['Range', '85 km'], detail: 'Motor 3 kW', range: '85 km estimated', rangeNote: 'Estimated range; terrain, rider weight, speed, temperature, and riding mode affect battery range.', peakPower: '3 kW', continuousPower: '[CONFIRM CONTINUOUS POWER]', battery: '48V 23Ah', topSpeed: '[CONFIRM TOP SPEED]', chargeTime: '[CONFIRM CHARGE TIME]', weight: '[CONFIRM BIKE WEIGHT]', seatHeight: '28.3"', recommendedHeight: '4\'11"–5\'10"', maxRiderWeight: '[CONFIRM MAX RIDER / PAYLOAD WEIGHT]', wheels: '14" / 12" wheels', tires: '[CONFIRM TIRE SIZES]', warranty: '12-month battery + motor coverage', bestFor: ['Beginner riders', 'Daily urban riding', 'Lightweight or compact riders'], riderFitGuidance: 'A compact, agile choice for riders in the listed height range. Taller riders or riders prioritizing a full-size frame may prefer ETQ VORTEX.', useCases: ['Urban riding: responsive and easy to handle.', 'Commuting: quiet electric performance for daily trips.', 'Recreation: versatile riding for casual outings.', 'Trails: suitable for lighter trail use; confirm terrain limits before riding.', 'Off-road: choose ETQ VORTEX for more aggressive terrain.'], accessoryFitment: 'The storefront describes the vented plates as custom-molded for ETorqued frames and intended for ETQ APEX and ETQ VORTEX frames. Confirm which plate maps to ETQ APEX before publishing a model-specific fitment claim.' },
  { id: 'vortex-stealth', collection: 'bikes', name: 'ETQ VORTEX', image: 'assets/vortex-17-14-new.jpg', alt: 'ETQ VORTEX electric dirt bike with 17/14 wheel setup', price: 1499.99, color: '#17191d', mark: 'V', stock: 5, conversionSpec: '⚡ 6000W PEAK • 🔋 72V 25Ah • 🛞 17"/14" • 📏 31.9" SEAT', tagline: 'Unleashed 6000W high-torque domination built for aggressive off-road terrain and max power delivery.', microSubhead: 'Raw power, full-size frame, and peak terrain control.', riderFit: 'Optimized for riders 5\'9"–6\'5"', specSummary: ['⚡ 6000W PEAK', '🔋 72V 25Ah', '🛞 17"/14"', '📏 31.9" SEAT'], description: 'Unleashed 6000W high-torque domination built for aggressive off-road terrain and max power delivery.', specs: ['Range', '60 km'], detail: 'Motor 6 kW', range: '60 km estimated', rangeNote: 'Estimated range; terrain, rider weight, speed, temperature, and riding mode affect battery range.', peakPower: '6 kW', continuousPower: '[CONFIRM CONTINUOUS POWER]', battery: '72V 25Ah', topSpeed: '[CONFIRM TOP SPEED]', chargeTime: '[CONFIRM CHARGE TIME]', weight: '[CONFIRM BIKE WEIGHT]', seatHeight: '31.9"', recommendedHeight: '5\'9"–6\'5"', maxRiderWeight: '[CONFIRM MAX RIDER / PAYLOAD WEIGHT]', wheels: '17" / 14" wheels', tires: '[CONFIRM TIRE SIZES]', warranty: '12-month battery + motor coverage', bestFor: ['Aggressive off-road riding', 'Trail riding', 'Tall riders'], riderFitGuidance: 'A full-size, high-torque choice for riders in the listed height range and riders who want more off-road capability. Shorter or compact riders may find ETQ APEX easier to manage.', useCases: ['Urban riding: possible, but the full-size setup favors open riding.', 'Commuting: use only where the bike and route are permitted.', 'Recreation: suited to high-output recreational riding.', 'Trails: intended for stronger trail performance.', 'Off-road: the better fit for aggressive off-road use.'], accessoryFitment: 'The storefront describes the vented plates as custom-molded for ETorqued frames and intended for ETQ APEX and ETQ VORTEX frames. Confirm which plate maps to ETQ VORTEX before publishing a model-specific fitment claim.' },
  { id: 'apex-vented-front-plate', collection: 'accessories', name: '"Apex" VENTED PLATE', image: 'assets/apex-vented-plate-front.png', gallery: ['assets/apex-vented-plate-front.png', 'assets/apex-vented-plate-side.png', 'assets/apex-vented-plate-angle.png'], alt: 'Gloss black Apex vented front plate', price: 22.99, color: '#242424', mark: 'A', stock: 8, description: 'High-gloss black cosmetic front plate with angular upper shield and lower mesh ventilation grid. Snap-on alternative to standard ODI plates.', features: ['High-gloss black cosmetic front plate', 'Angular upper shield with lower mesh ventilation grid', 'Snap-on alternative to standard ODI plates'], specs: ['Material', 'Gloss black plastic'], detail: 'Apex fitment' },
  { id: 'vortex-vented-front-plate', collection: 'accessories', name: '"Vortex" VENTED PLATE', image: 'assets/vortex-vented-plate-front.png', gallery: ['assets/vortex-vented-plate-front.png', 'assets/vortex-vented-plate-side.png', 'assets/vortex-vented-plate-angle.png'], alt: 'Gloss black Vortex vented front plate', price: 22.99, color: '#242424', mark: 'V', stock: 8, description: 'High-gloss black front plate featuring a curved top contour and wide diamond mesh grill. Lightweight snap-on aesthetic upgrade.', features: ['Curved top contour', 'Wide diamond mesh grill', 'Lightweight snap-on aesthetic upgrade'], specs: ['Material', 'Gloss black plastic'], detail: 'Vortex fitment' }
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
const modal = document.querySelector('#checkoutModal');
const cartModal = document.querySelector('#cartModal');
const cartItems = document.querySelector('#cartItems');
const cartSubtotal = document.querySelector('#cartSubtotal');
const checkoutItems = document.querySelector('#checkoutItems');
const cart = [];
const previewModal = document.querySelector('#productPreviewModal');
const previewArt = document.querySelector('#previewArt');
const previewThumbnails = document.querySelector('#previewThumbnails');
const previewQuantity = document.querySelector('#previewQuantity');
let selectedQuantity = 1;
const orderForm = document.querySelector('#orderForm');
const confirmation = document.querySelector('#confirmation');
const bagCount = document.querySelector('#bagCount');
const navBagCount = document.querySelector('#navBagCount');
const cartToast = document.querySelector('#cartToast');
const mobileMenu = document.querySelector('#mobileMenu');
const mobileMenuButton = document.querySelector('#mobileMenuButton');
let cartToastTimer;
let selectedProduct = products[0];
let currentReference = '';
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
const regionDelivery = { 'United Kingdom (UK)': '3–5 Business Days', 'United States (USA)': '5–8 Business Days', 'European Union (EU)': '3–6 Business Days' };
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
  { slug: 'privacy-policy', title: 'Privacy Policy', description: 'Draft ETorqued Privacy Policy covering information, orders, payments, cookies, and user rights.', sections: [
    ['Information we collect', '<p>We may receive information you provide when you browse, contact us, request an invoice, or place an order, including your name, email address, phone number, delivery address, region, order details, and messages. We may also receive device, browser, and page-use information needed to operate and protect the storefront.</p>'],
    ['How we use information', '<p>Information may be used to respond to support requests, prepare and confirm orders, arrange delivery, provide product support, maintain account or order records, improve the storefront, prevent fraud, and communicate about an order or request. We will not use your information for unrelated marketing without an appropriate choice or permission where required.</p>'],
    ['Cookies and analytics', '<p>Essential technologies support navigation, cart functions, checkout, security, and accessibility. Analytics cookies, if enabled, help us understand aggregate storefront use. Marketing cookies are not described as active by this draft until the business confirms the services used and obtains any required consent. See the <a href="#legal/cookie-policy">Cookie Policy</a> for preferences.</p>'],
    ['Payments and order processing', '<p>Payment and invoice information may be processed through the payment or banking method selected at checkout, including Revolut, bank transfer, or an invoice link. We do not ask you to submit full card credentials through this storefront. Delivery information is shared only as needed to process and support an order.</p>'],
    ['User rights', '<p>Depending on where you live, you may have rights to request access, correction, deletion, restriction, portability, or objection regarding personal information, and to withdraw consent where processing relies on consent. Contact us using the details below to make a request. We may need to verify the request before acting.</p>'],
    ['Retention and security', '<p>We retain information only for as long as reasonably necessary for the purpose collected, order support, recordkeeping, dispute handling, and applicable obligations. The business should confirm its retention schedule, security controls, service providers, and incident process before publication.</p>'],
    ['Contact', '<p>For privacy questions or requests, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>. Business identity and registered address details are listed as placeholders on the <a href="#legal/company-information">Company Information</a> page until confirmed.</p>']
  ]},
  { slug: 'cookie-policy', title: 'Cookie Policy', description: 'Draft ETorqued Cookie Policy covering essential, analytics, and marketing cookies.', sections: [
    ['What cookies are', '<p>Cookies and similar technologies are small files or identifiers stored on a device or read by a browser. They can help a site remember a session, keep a cart working, understand aggregate use, or support communications.</p>'],
    ['Essential cookies', '<p>Essential technologies are used for core functions such as cart state, checkout flow, security, accessibility, and remembering a consent choice. These cannot be disabled where the storefront cannot operate without them.</p>'],
    ['Analytics cookies', '<p>Analytics cookies are not confirmed as active in this draft. Before publication, add the names of any analytics provider, purpose, retention period, and whether data leaves the user’s region. Analytics should be disabled until a visitor makes any choice required by applicable rules.</p>'],
    ['Marketing cookies', '<p>No marketing cookie provider or advertising technology has been confirmed. Do not activate marketing cookies or pixels until the business identifies each provider, purpose, sharing arrangement, retention period, and consent requirement.</p>'],
    ['Your consent preferences', '<p>Where consent is required, visitors should be able to accept, reject, or manage non-essential cookies without being blocked from essential storefront functions. The final site should show a consent control linked from every page.</p>'],
    ['Changing or withdrawing consent', '<p>You can change your preference using the site’s cookie settings control once it is enabled. You can also manage cookies in your browser, although blocking essential cookies may affect cart, checkout, or page functionality. For questions, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>.</p>']
  ]},
  { slug: 'terms-and-conditions', title: 'Terms & Conditions', description: 'Draft ETorqued Terms and Conditions for storefront use, orders, delivery, products, and disputes.', sections: [
    ['Draft status and acceptance', '<p>This draft is for review and is not a final statement of the business’s legal terms. By using the storefront or submitting an order request, a visitor should agree to the final terms published by the business, subject to any mandatory consumer rights that apply to them.</p>'],
    ['Eligibility and acceptable use', '<p>You must be able to enter a binding agreement under the rules that apply to you. Use the storefront lawfully, provide accurate order information, do not interfere with its operation, and do not misuse product, payment, or support systems.</p>'],
    ['Orders, pricing, and payment', '<p>Product availability, descriptions, and prices are shown on the storefront and may change before an order is accepted. An order is not final until ETorqued confirms it. The business should confirm currency, taxes, payment timing, invoice handling, and how pricing errors are corrected before publication.</p>'],
    ['Delivery', '<p>Shipping regions, processing estimates, delivery estimates, and delivery limitations are described in the <a href="#legal/shipping-policy">Shipping Policy</a>. Delivery estimates are not guarantees unless the final business terms expressly say so. Customers must provide accurate delivery information and cooperate with carrier or customs requests.</p>'],
    ['Product use and safety', '<p>Follow the product instructions, use appropriate protective equipment, inspect the bike before riding, and obey applicable road, land-access, age, and safety rules. Products must not be modified or used in a way that creates an unreasonable risk or defeats safety features. Refer to the supplied product documentation for model-specific guidance.</p>'],
    ['Intellectual property', '<p>ETorqued branding, product content, text, graphics, and storefront design belong to the business or its licensors unless stated otherwise. You may use the storefront for personal shopping purposes but may not copy, republish, or commercially exploit its content without permission.</p>'],
    ['Liability and disputes', '<p>The final terms must explain any permitted limits of liability, exclusions, complaint route, governing law, and dispute process without removing mandatory consumer protections. The business should complete those jurisdiction-specific details with qualified advice.</p>'],
    ['Changes to these terms', '<p>ETorqued may update these terms by publishing a revised version with a new date. Material changes should be communicated in a way appropriate to the relationship and applicable rules.</p>']
  ]},
  { slug: 'warranty-policy', title: 'Warranty Policy', description: 'Draft ETorqued Warranty Policy covering battery and motor coverage, exclusions, and claims.', sections: [
    ['What is covered', '<p>The current storefront states that battery and motor components have 12-month coverage. The final policy must confirm the covered parts, whether coverage applies to the original purchaser only, and the remedy available after a valid claim.</p>'],
    ['Warranty duration', '<p>Unless the business confirms a different written promise for a specific product, this draft records the existing storefront statement of 12-month coverage for battery and motor components. The coverage start date and any mandatory statutory rights must be confirmed before publication.</p>'],
    ['Exclusions', '<p>Potential exclusions may include normal wear, cosmetic damage, misuse, accident damage, water or environmental damage outside product instructions, unauthorized modification, incorrect assembly, unsuitable maintenance, and use outside the supplied guidance. The final exclusions must be specific, fair, and legally reviewed.</p>'],
    ['Customer responsibilities', '<p>Use the bike as instructed, complete reasonable care and maintenance, stop using a product that appears unsafe, and keep records of relevant maintenance or communications. Do not attempt a repair that could create further damage unless instructed by ETorqued.</p>'],
    ['How to make a claim', '<p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> with your order reference, a description of the issue, photographs or video where useful, and the product serial number if available. Support may request additional information or an inspection before confirming the next step.</p>'],
    ['Proof of purchase', '<p>Keep your order confirmation, invoice, or other proof of purchase. A warranty claim may require this information to verify the product, purchase date, and purchaser.</p>']
  ]},
  { slug: 'returns-and-refunds', title: 'Returns & Refunds Policy', description: 'Draft ETorqued Returns and Refunds Policy covering eligibility, process, refunds, and damaged items.', sections: [
    ['Eligibility and time limits', '<p>The business has not provided a confirmed return window in the current storefront. Add the approved time limit here before publication. Any mandatory consumer cancellation or return rights should be stated accurately for the customer’s location.</p>'],
    ['Condition requirements', '<p>Returned items should be unused beyond reasonable inspection, complete, securely packaged, and accompanied by the order reference and included parts or documents. The final policy must explain how any lawful deduction for damage or use is assessed.</p>'],
    ['Return process', '<p>Contact <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> before sending anything back. Include your order reference, the item, reason for return, and photographs where relevant. Wait for written instructions and a return address; do not send goods to an unconfirmed address.</p>'],
    ['Refunds', '<p>After an approved return is received and checked, the business should state the refund method, timing, shipping treatment, and any lawful deductions. No refund period is asserted in this draft because the storefront does not confirm one.</p>'],
    ['Damaged, faulty, or incorrect items', '<p>Contact support promptly with photographs of the packaging and item, the order reference, and a description of the issue. Do not discard damaged packaging until support advises. Faulty goods may be handled under the Warranty Policy and any mandatory consumer protections.</p>'],
    ['Non-returnable items', '<p>The business has not confirmed any non-returnable categories. Add only categories that are legally permitted and actually sold, such as a clearly identified personalized or hygiene-sensitive item where applicable.</p>']
  ]},
  { slug: 'shipping-policy', title: 'Shipping Policy', description: 'Draft ETorqued Shipping Policy covering regions, processing, delivery, costs, customs, tracking, and damage.', sections: [
    ['Regions served', '<p>The current storefront lists shipping to the United Kingdom, United States, and European Union. Availability may depend on the destination, product, carrier, and applicable restrictions; confirm any excluded locations before publication.</p>'],
    ['Processing times', '<p>The storefront states that orders are prepared for dispatch within 2–4 business days. This is a current estimate, not a guarantee. The business should define when processing starts, whether weekends and holidays are excluded, and how preorders or unavailable items are handled.</p>'],
    ['Estimated delivery', '<p>Current estimates are 3–5 business days in the UK, 5–8 in the USA, and 3–6 across the EU. These estimates begin after dispatch and can vary by destination, carrier, customs, weather, and other events outside reasonable control.</p>'],
    ['Shipping costs', '<p>The storefront currently describes complimentary or free shipping to the UK, USA, and EU. The business should confirm whether this applies to every product and destination, and whether any surcharge is disclosed at checkout.</p>'],
    ['Customs, VAT, and import charges', '<p>The business has not confirmed whether prices include VAT or whether customers may owe import duties, brokerage, or local taxes. Add a clear destination-specific explanation before publication rather than promising that charges are included.</p>'],
    ['Tracking and delivery issues', '<p>Where tracking is available, ETorqued or its carrier should provide tracking details after dispatch. If tracking does not update or a parcel is late, contact <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> with the order reference and destination.</p>'],
    ['Damaged deliveries', '<p>Inspect the package when practical and photograph visible damage before opening. Report damage promptly with photographs, packaging details, and the order reference. Keep the item and packaging available while the carrier or support team investigates.</p>']
  ]},
  { slug: 'contact-us', title: 'Contact Us', description: 'Draft ETorqued contact information for customer support, order questions, and product help.', sections: [
    ['Customer support', '<p>Email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a> for product, delivery, invoice, warranty, returns, or order questions.</p>'],
    ['Response expectations', '<p>The storefront does not currently promise a response time. The business should add a realistic support-hours statement and response target before publication. We will aim to respond as soon as reasonably possible.</p>'],
    ['Order support instructions', '<p>Include your order reference, full name, delivery region, and a concise description of the issue. For damaged or faulty items, include clear photographs and keep the packaging until the support team advises.</p>'],
    ['Contact form', '<p>For a direct request, use <a class="legal-contact-link" href="mailto:etorqued@gmail.com?subject=ETORQUED%20support%20request">Email customer support →</a>. A server-backed contact form can be added once the business confirms its mail handling and privacy process.</p>']
  ]},
  { slug: 'company-information', title: 'Company Information', description: 'Draft ETorqued company information page with placeholders for required business details.', sections: [
    ['Business identity', '<dl class="legal-details"><div><dt>Legal business name</dt><dd>[ADD REGISTERED COMPANY NAME]</dd></div><div><dt>Trading name</dt><dd>ETORQUED</dd></div><div><dt>Registered address</dt><dd>[ADD REGISTERED ADDRESS]</dd></div><div><dt>Company registration number</dt><dd>[ADD COMPANY REGISTRATION NUMBER]</dd></div><div><dt>VAT number</dt><dd>[ADD VAT NUMBER OR CONFIRM NOT APPLICABLE]</dd></div><div><dt>Support email</dt><dd><a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a></dd></div><div><dt>Operating region</dt><dd>[ADD OPERATING REGION]</dd></div></dl>'],
    ['Customer support', '<p>For product and order support, email <a href="mailto:etorqued@gmail.com">etorqued@gmail.com</a>. The business should add its confirmed support hours and response target before publication.</p>'],
    ['Publication note', '<p>This page intentionally uses placeholders where the existing storefront does not provide verified company information. Replace every bracketed item and have the complete legal information reviewed before publishing.</p>']
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
  const overlays = [legalPage, faqModal, supportModal, modal, previewModal, cartModal, mobileMenu];
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
    [modal, closeCheckout],
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
  legalPageUpdated.textContent = 'Last updated: 22 September 2026';
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
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'ETORQUED high-performance electric dirt bikes — from €899,99. Instant electric torque, 12-month battery and motor coverage, free UK / USA / EU shipping.');
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
  [faqModal, supportModal, modal, previewModal, cartModal].forEach((overlay) => {
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
    document.querySelector('meta[name="description"]')?.setAttribute('content', 'ETORQUED high-performance electric dirt bikes — from €899,99. Instant electric torque, 12-month battery and motor coverage, free UK / USA / EU shipping.');
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
        <div class="product-info"><div class="product-info-copy"><h3>${escapeHtml(product.name)}</h3>${product.conversionSpec ? `<span class="product-specs">${escapeHtml(product.conversionSpec)}</span>` : ''}<span class="product-stock">⚡ Only ${escapeHtml(product.stock)} left in stock</span></div><span class="product-price">${euro(product.price)}</span></div>
        <button class="quick-add" type="button" data-quick-add="${escapeHtml(product.id)}">Quick Add to Bag <span aria-hidden="true">→</span></button>
      </article>
    `).join('');
  };
  renderCollection('bikes', bikeGrid);
  renderCollection('accessories', accessoryGrid);
}

// References are derived from the date plus random characters so two customers
// ordering on the same day can never be issued the same number.
function makeOrderReference() {
  const now = new Date();
  const stamp = [now.getFullYear() % 100, now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('');
  let suffix = '';
  if (window.crypto?.getRandomValues) {
    const randomValues = new Uint32Array(1);
    window.crypto.getRandomValues(randomValues);
    suffix = randomValues[0].toString(36).toUpperCase().slice(-4).padStart(4, '0');
  } else {
    suffix = Math.random().toString(36).toUpperCase().slice(2, 6).padStart(4, '0');
  }
  return `#ET-${stamp}-${suffix}`;
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
  bikeDetails.hidden = product.collection !== 'bikes';
  if (product.collection !== 'bikes') return;

  document.querySelector('#previewRiderFitGuidance').textContent = product.riderFitGuidance;
  document.querySelector('#previewRange').textContent = `${product.range}; maximum range: [CONFIRM MAXIMUM RANGE]`;
  document.querySelector('#previewRangeNote').textContent = product.rangeNote;
  document.querySelector('#previewFitment').textContent = product.accessoryFitment;
  bestFor.innerHTML = product.bestFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  useCases.innerHTML = product.useCases.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const specRows = [
    ['Peak power', product.peakPower],
    ['Continuous power', product.continuousPower],
    ['Battery', product.battery],
    ['Estimated top speed', product.topSpeed],
    ['Charge time', product.chargeTime],
    ['Bike weight', product.weight],
    ['Seat height', product.seatHeight],
    ['Recommended rider height', product.recommendedHeight],
    ['Maximum rider / payload', product.maxRiderWeight],
    ['Wheels', product.wheels],
    ['Tires', product.tires],
    ['Warranty', product.warranty]
  ];
  bikeSpecs.innerHTML = specRows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join('');
  document.querySelector('#previewDelivery').textContent = 'Delivery estimate: UK 3–5 · USA 5–8 · EU 3–6 business days';
}

function updateDeliveryBadge(region = '') {
  const delivery = regionDelivery[region] || '3–5 Business Days';
  const text = `Estimated Delivery: ${delivery}`;
  const previewDelivery = document.querySelector('#previewDelivery');
  if (previewDelivery) previewDelivery.textContent = text;
  const checkoutDelivery = document.querySelector('#checkoutDelivery');
  if (checkoutDelivery) checkoutDelivery.textContent = text;
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
  document.querySelector('#previewStock').textContent = `Catalog availability: ${product.stock}`;
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
    document.querySelector('#previewDelivery').textContent = 'Delivery estimate: UK 3–5 · USA 5–8 · EU 3–6 business days';
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

function showCartToast() {
  window.clearTimeout(cartToastTimer);
  cartToast.hidden = false;
  requestAnimationFrame(() => cartToast.classList.add('is-visible'));
  cartToastTimer = window.setTimeout(() => {
    cartToast.classList.remove('is-visible');
    window.setTimeout(() => { cartToast.hidden = true; }, 300);
  }, 2200);
}

function cartTotal() {
  return cart.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

function renderCart(newVariantKey) {
  if (!cart.length) {
    cartItems.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    cartSubtotal.textContent = euro(0);
    return;
  }
  cartItems.innerHTML = cart.map((item, index) => `<article class="cart-item${item.variantKey === newVariantKey ? ' is-new' : ''}" data-cart-index="${index}">
    <div class="cart-item-visual${item.product.collection === 'accessories' ? ' accessory-lift' : ''}">${item.product.image ? `<img class="product-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.alt || item.product.name)}" decoding="async">` : `<div class="product-art" style="--art:${escapeHtml(variantColors[item.variant.frame] || item.product.color)}" data-mark="${escapeHtml(item.product.mark)}"></div>`}</div>
    <div class="cart-item-info"><h3>${escapeHtml(item.product.name)}</h3><p>${escapeHtml(getVariantLabel(item.variant))} · ${euro(item.unitPrice)} each</p></div>
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
}

function openCart() {
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

function openCheckout() {
  if (!cart.length) return;
  currentReference = makeOrderReference();
  checkoutItems.innerHTML = cart.map((item) => `<div class="checkout-line"><span>${escapeHtml(item.product.name)}<small>${escapeHtml(getVariantLabel(item.variant))} × ${escapeHtml(item.quantity)}</small></span><strong>${euro(item.unitPrice * item.quantity)}</strong></div>`).join('');
  document.querySelector('#summaryTotal').textContent = euro(cartTotal());
  document.querySelector('#orderReference').textContent = currentReference;
  updateDeliveryBadge(document.querySelector('#deliveryRegion').value);
  orderForm.hidden = false;
  confirmation.hidden = true;
  rememberFocus();
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
  lockPageScroll();
  focusOverlayControl('#fullName');
}

function closeCheckout() {
  if (modal.hidden || modal.classList.contains('closing')) return;
  modal.classList.add('closing');
  modal.classList.remove('is-open');
  window.setTimeout(() => {
    modal.classList.remove('closing');
    modal.hidden = true;
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
    const card = event.target.closest('.product-card');
    const product = products.find((item) => item.id === card?.dataset.productId);
    if (product) { event.preventDefault(); openPreview(product); }
  });
});
document.querySelector('#bagButton').addEventListener('click', openCart);
document.querySelector('#navBagButton').addEventListener('click', openCart);
document.querySelector('#closeCart').addEventListener('click', closeCart);
document.querySelector('#proceedToCheckout').addEventListener('click', () => {
  if (!cart.length) return;
  closeCart();
  window.setTimeout(openCheckout, 320);
});
cartItems.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  const itemElement = event.target.closest('.cart-item');
  if (!actionButton || !itemElement) return;
  const item = cart[Number(itemElement.dataset.cartIndex)];
  if (!item) return;
  if (actionButton.dataset.action === 'increase') item.quantity = Math.min(99, item.quantity + 1);
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
document.querySelector('#deliveryRegion').addEventListener('change', (event) => updateDeliveryBadge(event.target.value));
previewModal.addEventListener('click', (event) => { if (event.target === previewModal) closePreview(); });
cartModal.addEventListener('click', (event) => { if (event.target === cartModal) closeCart(); });
document.querySelector('#closeModal').addEventListener('click', closeCheckout);
document.querySelector('#doneButton').addEventListener('click', closeCheckout);
document.querySelectorAll('[data-home-link]').forEach((link) => link.addEventListener('click', returnHome));
modal.addEventListener('click', (event) => { if (event.target === modal) closeCheckout(); });
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

  const sent = await sendEmail(emailConfig.inquiryTemplateId, {
    to_email: SUPPORT_EMAIL,
    to_name: 'ETORQUED',
    reply_to: fields.supportEmail,
    name: fields.supportName,
    email: fields.supportEmail,
    message: fields.supportMessage,
    support_email: SUPPORT_EMAIL,
    submitted_at: new Date().toUTCString()
  });

  form.dataset.sending = 'false';
  submitButton.disabled = false;
  if (sent) {
    submitButton.innerHTML = 'Inquiry Sent <span>✓</span>';
    form.reset();
    setFormStatus(inquiryStatus, `Thanks — your message is on its way. We’ll reply to ${fields.supportEmail}.`);
  } else {
    submitButton.innerHTML = originalLabel;
    setFormStatus(inquiryStatus, `We couldn’t send that automatically. Email ${SUPPORT_EMAIL} directly and we’ll pick it up.`);
  }
});

orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (orderForm.dataset.sending === 'true') return;
  if (isHoneypotFilled(orderForm)) return;
  const submitButton = orderForm.querySelector('button[type="submit"]');
  const orderStatus = document.querySelector('#orderStatus');
  const formData = Object.fromEntries(new FormData(orderForm));
  const order = { ...formData, delivery: { region: formData.region, fullName: formData.fullName, email: formData.email, phone: formData.phone, address: formData.address, postcode: formData.postcode }, reference: currentReference, items: cart.map((item) => ({ product: item.product.name, variant: getVariantLabel(item.variant), quantity: item.quantity, total: item.unitPrice * item.quantity })), total: cartTotal(), createdAt: new Date().toISOString() };
  const orders = JSON.parse(localStorage.getItem('etorqued-orders') || '[]');
  orders.push(order);
  localStorage.setItem('etorqued-orders', JSON.stringify(orders));
  const itemCount = cart.length;
  const deliveryEstimate = regionDelivery[formData.region] || '3–5 Business Days';
  const sharedParams = {
    order_reference: currentReference,
    order_items: order.items.map((item) => `${item.product} — ${item.variant} × ${item.quantity} — ${euro(item.total)}`).join('\n'),
    order_total: euro(order.total),
    delivery_region: formData.region,
    delivery_estimate: deliveryEstimate,
    customer_name: formData.fullName,
    customer_email: formData.email,
    customer_phone: formData.phone,
    address: formData.address,
    postcode: formData.postcode,
    support_email: SUPPORT_EMAIL
  };

  orderForm.dataset.sending = 'true';
  submitButton.disabled = true;
  const originalLabel = submitButton.innerHTML;
  submitButton.textContent = 'Sending…';
  setFormStatus(orderStatus, 'Sending your order…');

  // One template, two recipients: the merchant copy goes to etorqued@gmail.com
  // with reply-to set to the customer, the customer copy goes to the address
  // they entered and replies come back to the support inbox.
  const [merchantSent, customerSent] = await Promise.all([
    sendEmail(emailConfig.orderTemplateId, {
      ...sharedParams,
      to_email: SUPPORT_EMAIL,
      to_name: 'ETORQUED',
      reply_to: formData.email,
      role_headline: `New order ${currentReference} — ${euro(order.total)}`,
      role_intro: 'A new order was placed on the storefront. The fulfilment details are below.',
      role_next_step: `Reply to this email to reach ${formData.fullName}, raise the invoice, and confirm the delivery window.`
    }),
    sendEmail(emailConfig.orderTemplateId, {
      ...sharedParams,
      to_email: formData.email,
      to_name: formData.fullName,
      reply_to: SUPPORT_EMAIL,
      role_headline: `Your ETORQUED order ${currentReference}`,
      role_intro: 'Thanks for your order — here is a copy of what we received.',
      role_next_step: 'Next: we email your invoice and payment details, then confirm your delivery window.'
    })
  ]);

  orderForm.dataset.sending = 'false';
  submitButton.disabled = false;
  submitButton.innerHTML = originalLabel;
  setFormStatus(orderStatus, '');

  document.querySelector('#confirmationText').textContent = `Your order ${currentReference} for ${itemCount} item${itemCount === 1 ? '' : 's'} has been received. We’ll email your invoice and delivery details to ${formData.email}.`;
  document.querySelector('#confirmationFallback')?.remove();
  if (!merchantSent || !customerSent) {
    const fallback = document.createElement('p');
    fallback.id = 'confirmationFallback';
    fallback.className = 'form-status';
    const link = document.createElement('a');
    const subject = encodeURIComponent(`Order ${currentReference}`);
    const body = encodeURIComponent(`Reference: ${currentReference}\nTotal: ${euro(order.total)}\n\n${sharedParams.order_items}\n\nName: ${formData.fullName}\nDeliver to: ${formData.address}, ${formData.postcode}`);
    link.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    link.textContent = SUPPORT_EMAIL;
    fallback.append('An automatic copy of this order could not be sent. Email us at ', link, ` and quote your reference ${currentReference} so we can raise your invoice.`);
    document.querySelector('#confirmationText').after(fallback);
  }
  cart.length = 0;
  updateBagBadge();
  renderCart();
  orderForm.hidden = true;
  confirmation.hidden = false;
});
