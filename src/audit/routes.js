/**
 * Stripe Auditor — Express Routes
 * 
 * Simple key-paste flow: user enters their Stripe secret key,
 * the server runs 5 audit checks, and returns a full report.
 * No OAuth needed — works immediately without Stripe dashboard config.
 */

import Stripe from 'stripe';
import { runAudit, getHealthScore } from './index.js';
import { generateReportHtml } from './report.js';
import { config } from '../config.js';

export function setupAuditRoutes(app, deps) {

  // ── Landing Page ─────────────────────────────────────────────
  // GET /audit — Landing with key input form
  app.get('/audit', (req, res) => {
    const errorMsg = req.query.error === 'invalid_key' 
      ? '<div style="background:#fef2f2;color:#ef4444;padding:12px;border-radius:8px;margin-bottom:16px;font-size:14px">Invalid Stripe key. Must start with <strong>sk_live_</strong> or <strong>sk_test_</strong></div>'
      : '';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Billing Auditor — Free Revenue Leak Scan</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }
    .container { max-width: 600px; margin: 0 auto; padding: 48px 24px; text-align: center; }
    h1 { font-size: 32px; font-weight: 800; line-height: 1.2; }
    h1 span { color: #6366f1; }
    .subtitle { font-size: 16px; color: #64748b; margin-top: 12px; line-height: 1.5; }
    .card { background: white; border-radius: 12px; padding: 32px; margin-top: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .card p { font-size: 14px; color: #64748b; margin-bottom: 16px; }
    .benefits { text-align: left; margin: 24px 0; }
    .benefits li { list-style: none; padding: 6px 0; font-size: 14px; color: #334155; }
    .benefits li::before { content: "✓ "; color: #22c55e; font-weight: 700; }
    input[type="password"] { width: 100%; padding: 14px 16px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px; font-family: monospace; margin-bottom: 12px; }
    input[type="password"]:focus { outline: none; border-color: #6366f1; }
    .btn { display: inline-block; padding: 14px 48px; background: #6366f1; color: white; text-decoration: none; border: none; border-radius: 10px; font-weight: 600; font-size: 16px; cursor: pointer; }
    .btn:hover { background: #4f46e5; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .trust { color: #94a3b8; font-size: 13px; margin-top: 16px; }
    .footer { margin-top: 48px; color: #94a3b8; font-size: 13px; }
    .loader { display: none; margin: 16px auto; width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Your Stripe is <span>leaking revenue</span> and you don't know it.</h1>
    <p class="subtitle">Free scan checks 5 common billing gaps — disabled retries, stuck subscriptions, uncollected invoices, failed payment patterns, and recovery potential.</p>
    <ul class="benefits">
      <li>Read-only — your key is used once and not stored</li>
      <li>Finds 3-10% revenue leakage on average</li>
      <li>Results in under 10 seconds. Free. No strings.</li>
    </ul>

    <div class="card">
      <h2>Enter your Stripe secret key</h2>
      <p>Found in <a href="https://dashboard.stripe.com/apikeys" target="_blank" style="color:#6366f1">Stripe Dashboard → API Keys</a>. Your key is used once and not stored. Read-only access recommended.</p>
      ${errorMsg}
      <form id="auditForm" action="/audit/scan" method="POST">
        <input type="password" name="key" placeholder="sk_live_... or sk_test_..." required autocomplete="off" spellcheck="false" />
        <button type="submit" class="btn" id="submitBtn">Run Free Audit →</button>
      </form>
      <div class="loader" id="loader"></div>
      <p class="trust">🔒 Key is sent once over HTTPS. Not stored. Not logged.</p>
    </div>

    <div class="footer">Stripe Auditor</div>
  </div>
  <script>
    document.getElementById('auditForm').addEventListener('submit', function(e) {
      document.getElementById('submitBtn').disabled = true;
      document.getElementById('submitBtn').textContent = 'Scanning...';
      document.getElementById('loader').style.display = 'block';
    });
  </script>
</body>
</html>`);
  });

  // ── Run Audit ─────────────────────────────────────────────────
  // POST /audit/scan — Accepts Stripe key, runs audit, returns report
  app.post('/audit/scan', async (req, res) => {
    try {
      const key = req.body?.key?.trim();
      
      if (!key || (!key.startsWith('sk_live_') && !key.startsWith('sk_test_'))) {
        return res.redirect('/audit?error=invalid_key');
      }

      // Create a Stripe client with the provided key
      const stripe = new Stripe(key);

      // Verify the key works by fetching account info
      let account;
      try {
        account = await stripe.accounts.retrieve();
      } catch (err) {
        const errorMsg = err.message?.toLowerCase() || '';
        if (errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('invalid')) {
          return res.redirect('/audit?error=invalid_key');
        }
        return res.status(400).send(`Stripe connection failed: ${err.message}. Check your key and try again.`);
      }

      // Run all 5 audit checks
      const auditResult = await runAudit(stripe);

      // Get business name for the report
      const businessName = account.business_profile?.name 
        || account.settings?.dashboard?.display_name 
        || 'Your Stripe Account';

      // Generate and display the report
      const html = generateReportHtml(auditResult, { businessName });
      res.send(html);

    } catch (err) {
      console.error('❌ Audit scan error:', err.message);
      res.status(500).send(`Audit failed: ${err.message}`);
    }
  });

  // ── API: Run Audit (JSON) ─────────────────────────────────────
  // POST /api/audit/run — Accepts JSON, returns JSON
  app.post('/api/audit/run', async (req, res) => {
    try {
      // Support both form-encoded and JSON
      const key = req.body?.stripe_key || req.body?.key;
      
      if (!key || (!key.startsWith('sk_live_') && !key.startsWith('sk_test_'))) {
        return res.status(400).json({ error: 'Invalid Stripe key. Must start with sk_live_ or sk_test_.' });
      }

      const stripe = new Stripe(key);
      
      let account;
      try {
        account = await stripe.accounts.retrieve();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid Stripe key: ' + err.message });
      }

      const auditResult = await runAudit(stripe, { merchantId: account.id });

      res.json({
        account: {
          id: account.id,
          businessName: account.business_profile?.name || null,
        },
        ...auditResult,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Pricing / Subscribe ──────────────────────────────────────
  // GET /audit/subscribe — Shows pricing and checkout button
  app.get('/audit/subscribe', async (req, res) => {
    const error = req.query.error ? `<div style="background:#fef2f2;color:#ef4444;padding:12px;border-radius:8px;margin-bottom:16px;font-size:14px">${req.query.error}</div>` : '';
    const success = req.query.success ? `<div style="background:#f0fdf4;color:#22c55e;padding:12px;border-radius:8px;margin-bottom:16px;font-size:14px">Subscription active! You now have access to weekly monitoring.</div>` : '';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Auditor — Subscribe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }
    .container { max-width: 600px; margin: 0 auto; padding: 48px 24px; text-align: center; }
    h1 { font-size: 28px; font-weight: 800; }
    .subtitle { color: #64748b; margin-top: 8px; font-size: 16px; }
    .plan { background: white; border-radius: 12px; padding: 32px; margin: 32px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .price { font-size: 48px; font-weight: 800; color: #0f172a; }
    .price span { font-size: 20px; color: #64748b; }
    .features { text-align: left; margin: 24px 0; display: inline-block; }
    .features li { list-style: none; padding: 8px 0; font-size: 15px; color: #334155; }
    .features li::before { content: "✓ "; color: #22c55e; font-weight: 700; }
    .btn { display: inline-block; padding: 14px 48px; background: #6366f1; color: white; text-decoration: none; border: none; border-radius: 10px; font-weight: 600; font-size: 16px; cursor: pointer; }
    .btn:hover { background: #4f46e5; }
    .trust { color: #94a3b8; font-size: 13px; margin-top: 16px; }
    .footer { margin-top: 48px; color: #94a3b8; font-size: 13px; }
    ${error ? '.error { display: block; }' : ''}
  </style>
</head>
<body>
  <div class="container">
    <h1>Stop Leaking Revenue</h1>
    <p class="subtitle">Weekly Stripe billing audits with email alerts when new issues appear.</p>
    ${error}
    ${success}
    <div class="plan">
      <div class="price">$99 <span>/month</span></div>
      <ul class="features">
        <li>Weekly automated Stripe scan (5 checks)</li>
        <li>Email alerts when leakage changes</li>
        <li>Health score tracking over time</li>
        <li>Fix recommendations for each issue</li>
        <li>Cancel anytime — no lock-in</li>
      </ul>
      <form action="/audit/create-checkout" method="POST">
        <button type="submit" class="btn">Subscribe — $99/mo →</button>
      </form>
      <p class="trust">30-day money-back guarantee · Powered by Paddle</p>
    </div>
    <a href="/audit" style="color:#6366f1;font-size:14px">← Back to free scan</a>
    <div style="margin-top:24px;font-size:13px;color:#94a3b8">
      <a href="/terms-of-service" style="color:#94a3b8">Terms</a> ·
      <a href="/privacy-policy" style="color:#94a3b8">Privacy</a> ·
      <a href="/refund-policy" style="color:#94a3b8">Refund Policy</a>
    </div>
    <div class="footer">Stripe Auditor by Yashoraj <!--v3--></div>
  </div>
</body>
</html>`);
  });

  // ── Create Paddle Checkout ────────────────────────────────────
  // POST /audit/create-checkout — Creates a Paddle transaction via SDK, redirects to checkout
  app.post('/audit/create-checkout', async (req, res) => {
    try {
      if (!config.paddle.apiKey || !config.paddle.priceId) {
        return res.redirect('/audit/subscribe?error=Payment+not+configured.+Contact+support.');
      }

      // Use Paddle Node SDK to create a transaction with a checkout link
      const { Paddle } = await import('@paddle/paddle-node-sdk');
      const paddle = new Paddle(config.paddle.apiKey);

      const baseUrl = process.env.BASE_URL || 'https://bridge-v33u.onrender.com';

      const transaction = await paddle.transactions.create({
        items: [{ priceId: config.paddle.priceId, quantity: 1 }],
        customData: { source: 'stripe_auditor' },
        successUrl: `${baseUrl}/audit/subscribe?success=true`,
        cancelUrl: `${baseUrl}/audit/subscribe`,
      });

      const checkoutUrl = transaction?.checkout?.url;
      if (checkoutUrl) {
        res.redirect(checkoutUrl);
      } else if (transaction?.id) {
        // Fallback: redirect to checkout with transaction ID
        res.redirect(`https://checkout.paddle.com/checkout/${transaction.id}`);
      } else {
        res.redirect('/audit/subscribe?error=Checkout+link+not+generated.+Try+again.');
      }
    } catch (err) {
      console.error('❌ Paddle checkout error:', err.message);
      res.redirect('/audit/subscribe?error=Checkout+failed.+Email+yashanare193@gmail.com+for+help');
    }
  });

  // ── Paddle Webhook (uses existing /api/paddle-webhook in server.js) ──

  // ── Health endpoint ───────────────────────────────────────────
  // GET /api/audit/health Returns status
  app.get('/api/audit/health', (req, res) => {
    res.json({ status: 'running', version: '1.0.0', checks: ['retries', 'stuck-subscriptions', 'uncollected-invoices', 'failed-payments', 'recovery-potential'] });
  });

  console.log('✅ Stripe Auditor routes registered (key-paste + Paddle billing)');
}


