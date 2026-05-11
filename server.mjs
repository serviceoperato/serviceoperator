/**
 * Static site + admin email OTP (Resend). Set RESEND_API_KEY + ADMIN_JWT_SECRET on Railway.
 */
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'ServiceOpera <onboarding@resend.dev>').trim();
const JWT_SECRET = (process.env.ADMIN_JWT_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const OTP_TTL_MS = 10 * 60 * 1000;
const JWT_TTL_MS = 8 * 60 * 60 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 4;

/** @type {Map<string, { hash: string, exp: number }>} */
const otpByEmail = new Map();
/** @type {Map<string, number[]>} */
const sendTimestampsByIp = new Map();

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function signAdminJwt(email) {
  const exp = Date.now() + JWT_TTL_MS;
  const payload = { v: 1, role: 'admin', email, exp };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAdminJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (!timingEqual(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1 || payload.role !== 'admin' || typeof payload.email !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function pruneSends(ip) {
  const now = Date.now();
  const arr = sendTimestampsByIp.get(ip) || [];
  const fresh = arr.filter((t) => now - t < SEND_WINDOW_MS);
  sendTimestampsByIp.set(ip, fresh);
  return fresh;
}

async function sendResendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  });
  const text = await r.text();
  if (!r.ok) {
    const err = new Error('Resend HTTP ' + r.status + ': ' + text.slice(0, 400));
    err.status = r.status >= 500 ? 503 : 502;
    throw err;
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.get('/api/admin/capabilities', (_req, res) => {
  res.json({ otpEnabled: Boolean(RESEND_API_KEY) });
});

app.post('/api/admin/send-code', async (req, res) => {
  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email sign-in is not configured (missing RESEND_API_KEY).' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const generic = { ok: true, message: 'If that address is authorised, an email with a sign-in code was sent.' };

  if (email !== ADMIN_EMAIL) {
    return res.json(generic);
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  otpByEmail.set(ADMIN_EMAIL, { hash: sha256hex(code), exp: Date.now() + OTP_TTL_MS });

  try {
    await sendResendEmail({
      to: ADMIN_EMAIL,
      subject: 'ServiceOpera — admin sign-in code',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Your admin sign-in code is:</p>' +
        '<p style="font-family:ui-monospace,monospace;font-size:28px;font-weight:700;letter-spacing:0.15em;color:#111">' +
        code +
        '</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">This code expires in 10 minutes. If you did not request it, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    otpByEmail.delete(ADMIN_EMAIL);
    const status = e.status || 502;
    return res.status(status).json({ error: 'Could not send email. Check RESEND_FROM / domain and API key.' });
  }

  return res.json(generic);
});

app.post('/api/admin/verify-code', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().replace(/\s/g, '') : '';
  if (email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  const row = otpByEmail.get(ADMIN_EMAIL);
  if (!row || row.exp < Date.now()) {
    return res.status(401).json({ error: 'Code expired or not found. Request a new code.' });
  }
  if (!/^\d{6}$/.test(code) || row.hash !== sha256hex(code)) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  otpByEmail.delete(ADMIN_EMAIL);
  const token = signAdminJwt(ADMIN_EMAIL);
  return res.json({ ok: true, token, expiresInMs: JWT_TTL_MS });
});

app.get('/api/admin/session', (req, res) => {
  const h = req.headers.authorization || '';
  const m = typeof h === 'string' ? h.match(/^Bearer\s+(.+)$/i) : null;
  const token = m ? m[1].trim() : '';
  const payload = verifyAdminJwt(token);
  if (!payload) return res.status(401).json({ ok: false });
  return res.json({ ok: true, email: payload.email });
});

app.use(
  express.static(publicDir, {
    index: ['index.html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('client.html')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const p404 = path.join(publicDir, '404.html');
  if (fs.existsSync(p404)) {
    return res.status(404).sendFile(p404);
  }
  return res.status(404).type('text/plain').send('Not found');
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log('Listening on ' + port + ' · public=' + publicDir + ' · otp=' + Boolean(RESEND_API_KEY));
});
