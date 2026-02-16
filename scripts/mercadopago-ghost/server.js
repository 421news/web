const express = require('express');
const jwt = require('jsonwebtoken');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

// --- Config ---
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY;
const GHOST_URL = process.env.GHOST_URL || 'https://421bn.ghost.io';
const WIZARD_TIER_ID = process.env.WIZARD_TIER_ID || '66c8fcf131e80b000183e05d';
const PORT = process.env.PORT || 10000;
const ALLOWED_ORIGINS = ['https://www.421.news', 'https://421.news', 'https://421bn.ghost.io'];

// USD prices (in dollars, not cents)
const PRICES_USD = {
  'wizard-monthly': 9.99,
  'wizard-yearly': 99.90
};

// --- CORS middleware ---
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- HTTP helpers ---

function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    };
    if (options.body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = mod.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJSON(res.headers.location, options).then(resolve).catch(reject);
          return;
        }
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch (e) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// --- Blue dollar rate (cached 1 hour) ---

let cachedRate = null;
let cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getBlueDollarRate() {
  if (cachedRate && (Date.now() - cacheTime) < CACHE_TTL) {
    return cachedRate;
  }
  try {
    const { data } = await fetchJSON('https://dolarapi.com/v1/dolares/blue', {});
    if (data && data.venta) {
      cachedRate = data.venta;
      cacheTime = Date.now();
      console.log(`[mp] Blue dollar rate: $${cachedRate} ARS`);
      return cachedRate;
    }
    throw new Error('No venta field in response');
  } catch (err) {
    console.error(`[mp] Blue dollar API error: ${err.message}`);
    // Fallback: use last cached rate or a conservative estimate
    if (cachedRate) return cachedRate;
    throw new Error('Cannot fetch blue dollar rate');
  }
}

// --- MercadoPago API ---

function mpRequest(method, endpoint, body) {
  const url = `https://api.mercadopago.com${endpoint}`;
  return fetchJSON(url, {
    method,
    headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined
  });
}

// --- Ghost Admin API ---

function makeGhostJWT() {
  const [id, secret] = GHOST_ADMIN_KEY.split(':');
  return jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: '/admin/'
  });
}

function ghostRequest(method, path, body) {
  const token = makeGhostJWT();
  return fetchJSON(`${GHOST_URL}${path}`, {
    method,
    headers: { 'Authorization': `Ghost ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function findMemberByEmail(email) {
  const { status, data } = await ghostRequest(
    'GET',
    `/ghost/api/admin/members/?filter=email:'${encodeURIComponent(email)}'&include=labels,tiers`
  );
  if (status === 200 && data.members && data.members.length > 0) {
    return data.members[0];
  }
  return null;
}

async function createMember(email, name, labels, tiers) {
  const { status, data } = await ghostRequest('POST', '/ghost/api/admin/members/', {
    members: [{ email, name, labels, tiers }]
  });
  if (status === 201 || status === 200) {
    console.log(`[ghost] Created member: ${email}`);
    return data.members[0];
  }
  throw new Error(`Create member failed (${status}): ${JSON.stringify(data).slice(0, 200)}`);
}

async function updateMember(id, updates) {
  const { status, data } = await ghostRequest(
    'PUT',
    `/ghost/api/admin/members/${id}/?include=labels,tiers`,
    { members: [updates] }
  );
  if (status === 200) {
    console.log(`[ghost] Updated member: ${id}`);
    return data.members[0];
  }
  throw new Error(`Update member failed (${status}): ${JSON.stringify(data).slice(0, 200)}`);
}

// --- Label helpers ---

function buildActiveLabels(planType, existingLabels) {
  // Keep non-MP labels, add MP labels
  const keepLabels = (existingLabels || []).filter(l =>
    !['Wizard', 'mensual', 'anual', 'mp-cancelled'].includes(l.name)
  );
  const planLabel = planType === 'wizard-yearly' ? 'anual' : 'mensual';
  return [
    ...keepLabels,
    { name: 'Wizard' },
    { name: planLabel },
    { name: 'payment-method:mercadopago' }
  ];
}

function buildCancelledLabels(existingLabels) {
  const keepLabels = (existingLabels || []).filter(l =>
    !['Wizard', 'mensual', 'anual', 'mp-cancelled'].includes(l.name)
  );
  return [
    ...keepLabels,
    { name: 'mp-cancelled' },
    { name: 'payment-method:mercadopago' }
  ];
}

// --- Routes ---

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mercadopago-ghost', version: '1.0.0' });
});

// POST /subscribe — Create MercadoPago subscription
app.post('/subscribe', async (req, res) => {
  const { formSubType, formName, formEmail } = req.body;

  if (!formSubType || !formEmail) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const priceUSD = PRICES_USD[formSubType];
  if (!priceUSD) {
    return res.status(400).json({ success: false, message: 'Invalid subscription type' });
  }

  try {
    // Fetch blue dollar rate
    const blueRate = await getBlueDollarRate();
    const amountARS = Math.round(priceUSD * blueRate);

    // Determine frequency
    const isYearly = formSubType === 'wizard-yearly';
    const frequency = isYearly ? 12 : 1;
    const reason = isYearly
      ? '421 Wizard Anual'
      : '421 Wizard Mensual';

    // Store email + name + plan in external_reference for IPN lookup
    const externalRef = JSON.stringify({
      type: formSubType,
      email: formEmail,
      name: formName || ''
    });

    console.log(`[mp] Creating subscription: ${formSubType}, ${formEmail}, $${priceUSD} USD = $${amountARS} ARS (rate: ${blueRate})`);

    const { status, data } = await mpRequest('POST', '/preapproval', {
      payer_email: formEmail,
      back_url: 'https://www.421.news/gracias/',
      reason,
      auto_recurring: {
        frequency,
        frequency_type: 'months',
        transaction_amount: amountARS,
        currency_id: 'ARS'
      },
      external_reference: externalRef,
      status: 'pending'
    });

    if (status >= 200 && status < 300 && data.init_point) {
      console.log(`[mp] Subscription created: ${data.id}, redirect: ${data.init_point}`);
      return res.json({ success: true, redirectUrl: data.init_point });
    }

    console.error(`[mp] MP API error (${status}): ${JSON.stringify(data).slice(0, 300)}`);
    return res.status(500).json({ success: false, message: 'Error creating subscription' });
  } catch (err) {
    console.error(`[mp] Subscribe error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /webhook/mp-ipn — MercadoPago IPN webhook
app.post('/webhook/mp-ipn', async (req, res) => {
  // Respond immediately so MP doesn't timeout
  res.status(200).json({ received: true });

  try {
    await handleIPN(req.body, req.query);
  } catch (err) {
    console.error(`[ipn] Error: ${err.message}`);
  }
});

async function handleIPN(body, query) {
  // MercadoPago sends notifications in different formats
  // New format: { action, type, data: { id } }
  // Old format: query params ?type=...&id=...
  let notifType = body.type || query.type || query.topic;
  let resourceId = (body.data && body.data.id) || query.id || query['data.id'];

  if (!resourceId) {
    console.log('[ipn] No resource ID in notification, ignoring');
    return;
  }

  console.log(`[ipn] Notification: type=${notifType}, action=${body.action}, id=${resourceId}`);

  // Handle subscription_preapproval notifications
  if (notifType === 'subscription_preapproval') {
    await handlePreapprovalUpdate(resourceId);
    return;
  }

  // Handle payment notifications (authorized_payment)
  if (notifType === 'payment' || notifType === 'authorized_payment') {
    await handlePaymentNotification(resourceId);
    return;
  }

  console.log(`[ipn] Unhandled notification type: ${notifType}`);
}

async function handlePreapprovalUpdate(preapprovalId) {
  // Fetch the preapproval details from MP
  const { status: httpStatus, data } = await mpRequest('GET', `/preapproval/${preapprovalId}`);
  if (httpStatus !== 200) {
    console.error(`[ipn] Failed to fetch preapproval ${preapprovalId}: ${httpStatus}`);
    return;
  }

  const mpStatus = data.status; // "authorized", "cancelled", "paused", "pending"
  console.log(`[ipn] Preapproval ${preapprovalId}: status=${mpStatus}`);

  // Parse external_reference to get email/name/plan
  let email, name, planType;
  try {
    const ref = JSON.parse(data.external_reference || '{}');
    email = ref.email || data.payer_email;
    name = ref.name || '';
    planType = ref.type || 'wizard-monthly';
  } catch (e) {
    email = data.payer_email;
    name = '';
    planType = data.reason && data.reason.toLowerCase().includes('anual')
      ? 'wizard-yearly'
      : 'wizard-monthly';
  }

  if (!email) {
    console.error(`[ipn] No email found for preapproval ${preapprovalId}`);
    return;
  }

  email = email.toLowerCase().trim();

  if (mpStatus === 'authorized') {
    await activateMember(email, name, planType);
  } else if (mpStatus === 'cancelled' || mpStatus === 'paused') {
    await deactivateMember(email);
  } else {
    console.log(`[ipn] Preapproval status "${mpStatus}" — no action needed`);
  }
}

async function handlePaymentNotification(paymentId) {
  // Fetch payment details
  const { status: httpStatus, data } = await mpRequest('GET', `/v1/payments/${paymentId}`);
  if (httpStatus !== 200) {
    console.error(`[ipn] Failed to fetch payment ${paymentId}: ${httpStatus}`);
    return;
  }

  // Only process approved payments that are from subscriptions
  if (data.status !== 'approved') {
    console.log(`[ipn] Payment ${paymentId} status="${data.status}" — skipping`);
    return;
  }

  // Check if this payment is linked to a preapproval (subscription)
  const preapprovalId = data.metadata && data.metadata.preapproval_id;
  if (preapprovalId) {
    await handlePreapprovalUpdate(preapprovalId);
    return;
  }

  // Try to get email from payment payer
  const email = data.payer && data.payer.email;
  if (!email) {
    console.log(`[ipn] Payment ${paymentId} has no payer email — skipping`);
    return;
  }

  // Parse external_reference if available
  let planType = 'wizard-monthly';
  try {
    const ref = JSON.parse(data.external_reference || '{}');
    planType = ref.type || 'wizard-monthly';
  } catch (e) {
    // Not JSON, try to infer
    if (data.description && data.description.toLowerCase().includes('anual')) {
      planType = 'wizard-yearly';
    }
  }

  console.log(`[ipn] Payment approved: ${email}, plan=${planType}`);
  await activateMember(email.toLowerCase().trim(), '', planType);
}

async function activateMember(email, name, planType) {
  console.log(`[ghost] Activating member: ${email} (${planType})`);

  const existing = await findMemberByEmail(email);
  const labels = buildActiveLabels(planType, existing ? existing.labels : []);
  const tiers = [{ id: WIZARD_TIER_ID }];

  if (existing) {
    // Update existing member
    await updateMember(existing.id, { labels, tiers });
    console.log(`[ghost] Updated existing member: ${email}`);
  } else {
    // Create new member
    await createMember(email, name, labels, tiers);
    console.log(`[ghost] Created new member: ${email}`);
  }
}

async function deactivateMember(email) {
  console.log(`[ghost] Deactivating member: ${email}`);

  const existing = await findMemberByEmail(email);
  if (!existing) {
    console.log(`[ghost] Member not found: ${email} — nothing to deactivate`);
    return;
  }

  const labels = buildCancelledLabels(existing.labels);
  // Remove Wizard tier by sending empty tiers array
  // Keep existing non-Wizard tiers
  const tiers = (existing.tiers || []).filter(t => t.id !== WIZARD_TIER_ID);

  await updateMember(existing.id, { labels, tiers });
  console.log(`[ghost] Deactivated member: ${email}`);
}

// --- Debug/test endpoint ---
app.post('/test/activate', async (req, res) => {
  const { email, name, planType } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await activateMember(email, name || '', planType || 'wizard-monthly');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/test/rate', async (req, res) => {
  try {
    const rate = await getBlueDollarRate();
    res.json({
      blueRate: rate,
      prices: {
        'wizard-monthly': { usd: PRICES_USD['wizard-monthly'], ars: Math.round(PRICES_USD['wizard-monthly'] * rate) },
        'wizard-yearly': { usd: PRICES_USD['wizard-yearly'], ars: Math.round(PRICES_USD['wizard-yearly'] * rate) }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Keep-alive ping (Render free tier) ---
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(() => {
  const mod = SELF_URL.startsWith('https') ? https : http;
  mod.get(`${SELF_URL}/`, (res) => {
    console.log(`[keep-alive] ping ${res.statusCode}`);
  }).on('error', (err) => {
    console.log(`[keep-alive] ping failed: ${err.message}`);
  });
}, 14 * 60 * 1000);

// --- Start ---
app.listen(PORT, () => {
  const missing = [];
  if (!MP_ACCESS_TOKEN) missing.push('MP_ACCESS_TOKEN');
  if (!GHOST_ADMIN_KEY) missing.push('GHOST_ADMIN_KEY');
  if (!GHOST_URL) missing.push('GHOST_URL');
  if (missing.length) {
    console.warn(`[mp] WARNING: Missing env vars: ${missing.join(', ')}`);
  }
  console.log(`[mp] Listening on port ${PORT}`);
  console.log(`[mp] Ghost: ${GHOST_URL}`);
  console.log(`[mp] Wizard tier: ${WIZARD_TIER_ID}`);
  console.log(`[keep-alive] Self-ping every 14min`);
});
