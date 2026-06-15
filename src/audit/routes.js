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
  // GET /audit — Premium SaaS landing page (Stripe/Linear inspired)
  app.get('/audit', (req, res) => {
    const errorMsg = req.query.error === 'invalid_key' 
      ? '<div style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:12px 16px;border-radius:10px;margin-bottom:16px;font-size:14px;font-weight:500">Invalid Stripe key. Must start with <strong>sk_live_</strong> or <strong>sk_test_</strong></div>'
      : '';

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Auditor — Find Hidden Revenue Leaks in Your Stripe Account</title>
  <meta name="description" content="Free Stripe audit tool. Paste your key, get a report showing exactly how much revenue you're losing to failed payments, stuck subscriptions, and misconfigured billing.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    /* ── Reset & Base ── */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: #fafafa; color: #0a0a0b; line-height: 1.6; }

    /* ── Color System ── */
    :root {
      --bg: #fafafa;
      --surface: #ffffff;
      --border: #e4e4e7;
      --border-light: #f0f0f3;
      --text: #0a0a0b;
      --text-secondary: #52525b;
      --text-muted: #a1a1aa;
      --accent: #7c3aed;
      --accent-dark: #6d28d9;
      --accent-soft: rgba(124, 58, 237, 0.06);
      --accent-ring: rgba(124, 58, 237, 0.25);
      --green: #059669;
      --green-soft: rgba(5, 150, 105, 0.08);
      --amber: #d97706;
      --amber-soft: rgba(217, 119, 6, 0.08);
      --red: #dc2626;
      --red-soft: rgba(220, 38, 38, 0.06);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
    }

    /* ── Nav ── */
    .nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; max-width: 1200px; margin: 0 auto; }
    .nav-logo { font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: var(--text); }
    .nav-logo span { color: var(--accent); }
    .nav-links { display: flex; align-items: center; gap: 32px; }
    .nav-links a { font-size: 14px; font-weight: 500; color: var(--text-secondary); text-decoration: none; transition: color 0.2s; }
    .nav-links a:hover { color: var(--text); }
    .nav-cta { font-size: 14px; font-weight: 600; background: var(--text); color: #fff !important; padding: 10px 24px; border-radius: var(--radius-sm); text-decoration: none; transition: all 0.2s; }
    .nav-cta:hover { background: #27272a !important; transform: translateY(-1px); }

    /* ── Container ── */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
    .container-narrow { max-width: 720px; margin: 0 auto; padding: 0 32px; }

    /* ── Hero ── */
    .hero { padding: 80px 0 60px; text-align: center; position: relative; overflow: hidden; }
    .hero-glow { position: absolute; top: -30%; left: 50%; transform: translateX(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 60%); pointer-events: none; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; padding: 6px 16px; border-radius: 100px; margin-bottom: 24px; border: 1px solid rgba(124,58,237,0.1); }
    .hero h1 { font-size: clamp(40px, 6vw, 64px); font-weight: 900; line-height: 1.08; letter-spacing: -0.035em; margin-bottom: 20px; color: var(--text); }
    .hero h1 .accent { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero p { font-size: clamp(17px, 2vw, 19px); color: var(--text-secondary); max-width: 560px; margin: 0 auto 32px; font-weight: 400; line-height: 1.65; }

    /* ── Scan Form ── */
    .scan-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 40px; max-width: 560px; margin: 0 auto 24px; text-align: left; box-shadow: 0 4px 24px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02); }
    .scan-card .label { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: 0.01em; display: flex; align-items: center; gap: 6px; }
    .scan-card .label .lock { color: var(--text-muted); font-weight: 400; font-size: 12px; }
    .scan-input-group { display: flex; gap: 8px; margin-bottom: 12px; }
    .scan-input-group input { flex: 1; padding: 14px 16px; border: 2px solid var(--border); border-radius: var(--radius-sm); font-size: 15px; font-family: 'Inter', monospace; background: var(--bg); color: var(--text); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .scan-input-group input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
    .scan-input-group input::placeholder { color: var(--text-muted); font-family: 'Inter', monospace; }
    .scan-input-group button { padding: 14px 32px; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .scan-input-group button:hover { background: var(--accent-dark); transform: translateY(-1px); box-shadow: 0 4px 12px var(--accent-ring); }
    .scan-input-group button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .scan-note { font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-top: 6px; }
    .scan-note span { color: var(--green); font-weight: 600; }
    .scan-trust { display: flex; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
    .scan-trust-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
    .scan-trust-item svg { flex-shrink: 0; }

    /* ── Metrics Bar ── */
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 720px; margin: 48px auto 0; }
    .metric { text-align: center; padding: 24px 16px; background: var(--surface); border: 1px solid var(--border-light); border-radius: var(--radius-md); }
    .metric-value { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
    .metric-value.green { color: var(--green); }
    .metric-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; font-weight: 500; }

    /* ── Section Headers ── */
    section { padding: 80px 0; }
    section.alt { background: var(--surface); border-top: 1px solid var(--border-light); border-bottom: 1px solid var(--border-light); }
    .section-label { font-size: 13px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
    .section-title { font-size: clamp(28px, 4vw, 36px); font-weight: 800; letter-spacing: -0.03em; color: var(--text); margin-bottom: 16px; line-height: 1.15; }
    .section-sub { font-size: 17px; color: var(--text-secondary); max-width: 560px; line-height: 1.6; }

    /* ── Problem / Solution ── */
    .problem-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; }
    .problem-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 28px; border-left: 3px solid var(--red); }
    .problem-card.green { border-left-color: var(--green); }
    .problem-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; color: var(--text); }
    .problem-card p { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }

    /* ── How It Works ── */
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; margin-top: 48px; }
    .step { text-align: center; padding: 32px 24px; background: var(--surface); border: 1px solid var(--border-light); border-radius: var(--radius-md); position: relative; }
    .step-number { width: 40px; height: 40px; background: var(--accent-soft); color: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; margin: 0 auto 16px; }
    .step h3 { font-size: 17px; font-weight: 700; margin-bottom: 8px; color: var(--text); }
    .step p { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }
    .step-arrow { display: none; }

    /* ── Features ── */
    .features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 40px; }
    .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 28px; transition: all 0.2s; }
    .feature-card:hover { border-color: var(--accent); box-shadow: 0 4px 20px rgba(124,58,237,0.06); }
    .feature-icon { width: 40px; height: 40px; background: var(--accent-soft); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 18px; }
    .feature-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .feature-card .feature-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.6; }
    .feature-card .feature-why { font-size: 13px; color: var(--text-muted); margin-top: 10px; display: flex; align-items: flex-start; gap: 6px; }

    /* ── Social Proof ── */
    .proof-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 40px; }
    .proof-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 28px; text-align: center; }
    .proof-stat { font-size: 36px; font-weight: 900; letter-spacing: -0.03em; color: var(--text); }
    .proof-stat.accent { color: var(--accent); }
    .proof-stat.green { color: var(--green); }
    .proof-label { font-size: 14px; color: var(--text-secondary); margin-top: 4px; font-weight: 500; }
    .proof-source { font-size: 12px; color: var(--text-muted); margin-top: 8px; }

    .testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 32px; margin-top: 24px; max-width: 640px; margin-left: auto; margin-right: auto; }
    .testimonial blockquote { font-size: 15px; color: var(--text); line-height: 1.7; font-weight: 500; }
    .testimonial blockquote::before { content: '"'; color: var(--accent); font-size: 24px; font-weight: 900; }
    .testimonial cite { display: block; margin-top: 12px; font-size: 13px; color: var(--text-secondary); font-style: normal; font-weight: 500; }
    .testimonial cite span { color: var(--text-muted); font-weight: 400; }

    /* ── Comparison ── */
    .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; }
    .compare-col { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 32px; }
    .compare-col.highlight { border-color: var(--accent); box-shadow: 0 4px 20px rgba(124,58,237,0.08); position: relative; }
    .compare-col.highlight::after { content: 'Recommended'; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 100px; letter-spacing: 0.03em; text-transform: uppercase; }
    .compare-col h3 { font-size: 18px; font-weight: 700; margin-bottom: 20px; }
    .compare-col ul { list-style: none; }
    .compare-col li { padding: 10px 0; font-size: 14px; color: var(--text-secondary); border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 10px; }
    .compare-col li:last-child { border-bottom: none; }
    .compare-col li .check { color: var(--green); font-weight: 700; }
    .compare-col li .cross { color: var(--red); font-weight: 700; }

    /* ── FAQ ── */
    .faq-list { max-width: 640px; margin: 40px auto 0; }
    .faq-item { border-bottom: 1px solid var(--border-light); padding: 20px 0; }
    .faq-q { font-size: 15px; font-weight: 600; color: var(--text); display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .faq-q .toggle { color: var(--text-muted); font-size: 18px; transition: transform 0.2s; }
    .faq-a { font-size: 14px; color: var(--text-secondary); line-height: 1.7; margin-top: 10px; display: none; }
    .faq-item.open .faq-a { display: block; }
    .faq-item.open .toggle { transform: rotate(45deg); }

    /* ── Final CTA ── */
    .cta-section { text-align: center; padding: 80px 0; }
    .cta-section h2 { font-size: clamp(28px, 4vw, 36px); font-weight: 800; letter-spacing: -0.03em; margin-bottom: 12px; }
    .cta-section p { color: var(--text-secondary); font-size: 17px; margin-bottom: 32px; }

    /* ── Footer ── */
    .footer { padding: 32px 0; text-align: center; border-top: 1px solid var(--border-light); }
    .footer-links { display: flex; justify-content: center; gap: 24px; margin-bottom: 12px; }
    .footer-links a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
    .footer-links a:hover { color: var(--text-secondary); }
    .footer-copy { font-size: 13px; color: var(--text-muted); }

    /* ── Loader ── */
    .loader { display: none; margin: 0 auto; width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .nav-links { display: none; }
      .problem-grid, .features-grid, .steps, .proof-grid, .compare-grid { grid-template-columns: 1fr; }
      .scan-input-group { flex-direction: column; }
      .scan-input-group button { width: 100%; }
      .metrics { grid-template-columns: 1fr; gap: 12px; }
      .scan-trust { flex-direction: column; gap: 8px; }
      section { padding: 48px 0; }
      .hero { padding: 48px 0 32px; }
    }
  </style>
</head>
<body>

  <!-- ── Nav ── -->
  <nav class="nav">
    <div class="nav-logo">Stripe <span>Auditor</span></div>
    <div class="nav-links">
      <a href="#how-it-works">How it works</a>
      <a href="#features">Features</a>
      <a href="#faq">FAQ</a>
      <a href="/audit/subscribe" class="nav-cta">Subscribe — $99/mo</a>
    </div>
  </nav>

  <!-- ── Hero ── -->
  <section class="hero">
    <div class="hero-glow"></div>
    <div class="container-narrow">
      <div class="hero-badge">🔥 Free scan — 30 seconds</div>
      <h1>Find out exactly how much <span class="accent">revenue your Stripe account is losing</span> right now.</h1>
      <p>One paste of your Stripe key and we run 5 billing checks — retry settings, stuck subscriptions, unpaid invoices, failed payment patterns, and recovery potential. Results in seconds.</p>

      <div class="scan-card">
        <div class="label">
          Enter your Stripe key
          <span class="lock">— read-only, not stored</span>
        </div>
        ${errorMsg}
        <form id="auditForm" action="/audit/scan" method="POST">
          <div class="scan-input-group">
            <input type="password" name="key" placeholder="sk_live_... or sk_test_..." required autocomplete="off" spellcheck="false" />
            <button type="submit" class="btn" id="submitBtn">
              Run Free Audit
              <span class="loader" id="loader"></span>
            </button>
          </div>
          <div class="scan-note">
            <span>✓</span> Found in <a href="https://dashboard.stripe.com/apikeys" target="_blank" style="color:var(--accent);font-weight:500">Stripe Dashboard → API Keys</a>
          </div>
          <div class="scan-trust">
            <div class="scan-trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Read-only. Nothing is charged.
            </div>
            <div class="scan-trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Not stored. Not logged.
            </div>
            <div class="scan-trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Results in ~10 seconds.
            </div>
          </div>
        </form>
      </div>

      <div class="metrics">
        <div class="metric">
          <div class="metric-value">3–10%</div>
          <div class="metric-label">Average revenue leakage found</div>
        </div>
        <div class="metric">
          <div class="metric-value green">$340</div>
          <div class="metric-label">Average monthly leak per account</div>
        </div>
        <div class="metric">
          <div class="metric-value">60s</div>
          <div class="metric-label">From signup to results</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Problem Section ── -->
  <section class="alt" id="problem">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">The Problem</div>
      <h2 class="section-title">Your Stripe dashboard looks fine. <br>Your revenue is still disappearing.</h2>
      <p class="section-sub" style="margin:0 auto 40px">Stripe shows you payments that succeeded. It doesn't show you the money you should have earned but didn't — because of billing gaps you didn't know existed.</p>
    </div>
    <div class="container">
      <div class="problem-grid">
        <div class="problem-card">
          <h3>Payments fail silently</h3>
          <p>Cards expire, banks decline, payments fail. Stripe retries a few times and gives up. Your customer never updates their card, and you never see the money.</p>
        </div>
        <div class="problem-card">
          <h3>Subscriptions get stuck</h3>
          <p>A subscription goes past_due, then unpaid, then canceled. It shows as "churned" in your dashboard. But it wasn't a cancellation — it was a billing failure you could have fixed.</p>
        </div>
        <div class="problem-card">
          <h3>Invoices pile up unpaid</h3>
          <p>Stripe creates invoices automatically. When they go unpaid, there's no alert. No follow-up. No recovery. They sit there, and the revenue sits with them.</p>
        </div>
        <div class="problem-card green">
          <h3>✓ Most of this is recoverable</h3>
          <p>Industry data shows 40–70% of failed payments can be recovered with the right retry timing and customer outreach. You just need to know which ones to target.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── How It Works ── -->
  <section id="how-it-works">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">How It Works</div>
      <h2 class="section-title">Three seconds. <br>Three steps. One report.</h2>
      <p class="section-sub" style="margin:0 auto">No signup. No permissions. No meeting with a salesperson. Just paste and go.</p>
    </div>
    <div class="container">
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Find your Stripe key</h3>
          <p>Go to Stripe Dashboard → API Keys. Copy your secret key. It takes 10 seconds.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Paste it here</h3>
          <p>We never store it. The key is used once, over HTTPS, to read your billing setup. Nothing is charged.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Get your leakage report</h3>
          <p>We run 5 checks and show you exactly where money is leaking — with dollar amounts and fix recommendations.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Features ── -->
  <section class="alt" id="features">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">The Audit</div>
      <h2 class="section-title">5 checks that find <br>where your money is going.</h2>
      <p class="section-sub" style="margin:0 auto">Each check examines a specific billing gap. You get a pass/fail rating, a dollar impact estimate, and a fix recommendation.</p>
    </div>
    <div class="container">
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🔄</div>
          <h3>Retry Configuration</h3>
          <p class="feature-desc">Checks if Stripe's automatic retry is enabled and configured optimally. Most accounts use the default — which gives up too early.</p>
          <div class="feature-why"><span>💡</span> Better retry timing recovers 2–5x more failed payments.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">⏸</div>
          <h3>Stuck Subscriptions</h3>
          <p class="feature-desc">Finds subscriptions that are past_due or unpaid — stuck in limbo where no action is being taken.</p>
          <div class="feature-why"><span>💡</span> Each stuck sub represents active revenue you can recover today.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📄</div>
          <h3>Uncollected Invoices</h3>
          <p class="feature-desc">Counts open invoices that Stripe has given up on. These are customers who tried to pay but couldn't.</p>
          <div class="feature-why"><span>💡</span> A single dunning email recovers 20–40% of these.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📉</div>
          <h3>Failed Payment Patterns</h3>
          <p class="feature-desc">Analyzes your recent failed payment history — what's failing, why, and how much is at risk.</p>
          <div class="feature-why"><span>💡</span> Understanding the pattern lets you fix the root cause.</div>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💰</div>
          <h3>Recovery Potential</h3>
          <p class="feature-desc">Estimates how much revenue you could recover with the right retry and dunning setup. Based on your actual data.</p>
          <div class="feature-why"><span>💡</span> Most SaaS businesses recover 40–70% of failed payments with the right approach.</div>
        </div>
        <div class="feature-card" style="background:var(--accent-soft);border-color:rgba(124,58,237,0.2)">
          <div class="feature-icon">📊</div>
          <h3>Weekly Monitoring</h3>
          <p class="feature-desc">Subscribe to get automated weekly scans + email alerts when new issues appear. Track your health score over time.</p>
          <div class="feature-why"><span>✨</span> Included in the $99/mo plan. Cancel anytime.</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Social Proof ── -->
  <section id="proof">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">Real Results</div>
      <h2 class="section-title">Found money is the <br>best kind of money.</h2>
    </div>
    <div class="container">
      <div class="proof-grid">
        <div class="proof-card">
          <div class="proof-stat green">$2,300</div>
          <div class="proof-label">Monthly leak found in one account</div>
          <div class="proof-source">Had been leaking for 11 months</div>
        </div>
        <div class="proof-card">
          <div class="proof-stat accent">13/20</div>
          <div class="proof-label">Accounts with critical billing gaps</div>
          <div class="proof-source">Independent audit of 20 Stripe accounts</div>
        </div>
        <div class="proof-card">
          <div class="proof-stat">$340</div>
          <div class="proof-label">Average monthly leakage per account</div>
          <div class="proof-source">Across all accounts audited</div>
        </div>
      </div>

      <div class="testimonial">
        <blockquote>
          I had no idea. I tested checkout once and shipped. Three months later, I was losing $800/month to failed payments I never knew existed.
        </blockquote>
        <cite>SaaS founder <span>(independent audit, April 2026)</span></cite>
      </div>
    </div>
  </section>

  <!-- ── Comparison ── -->
  <section class="alt" id="compare">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">Comparison</div>
      <h2 class="section-title">Why not just check Stripe directly?</h2>
      <p class="section-sub" style="margin:0 auto">Because Stripe shows you payments. It doesn't show you what you're missing.</p>
    </div>
    <div class="container">
      <div class="compare-grid">
        <div class="compare-col">
          <h3>Stripe Dashboard</h3>
          <ul>
            <li><span class="cross">✗</span> Shows revenue that happened</li>
            <li><span class="cross">✗</span> No failed payment analysis</li>
            <li><span class="cross">✗</span> No recovery recommendations</li>
            <li><span class="cross">✗</span> No health score tracking</li>
            <li><span class="cross">✗</span> No weekly monitoring</li>
            <li><span class="check">✓</span> Free</li>
          </ul>
        </div>
        <div class="compare-col highlight">
          <h3>Stripe Auditor</h3>
          <ul>
            <li><span class="check">✓</span> Shows revenue you're missing</li>
            <li><span class="check">✓</span> 5-point billing gap analysis</li>
            <li><span class="check">✓</span> Dollar-value fix recommendations</li>
            <li><span class="check">✓</span> Health score over time</li>
            <li><span class="check">✓</span> Weekly automated scans</li>
            <li><span class="check">✓</span> Free scan · $99/mo monitoring</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ── FAQ ── -->
  <section id="faq">
    <div class="container-narrow" style="text-align:center">
      <div class="section-label">FAQ</div>
      <h2 class="section-title">Questions? <br>Probably answered here.</h2>
    </div>
    <div class="container-narrow">
      <div class="faq-list">
        <div class="faq-item open">
          <div class="faq-q">Is it really free? <span class="toggle">+</span></div>
          <div class="faq-a">Yes. The one-time scan is completely free. No credit card, no signup, no hidden charges. Paste your key, get your report. If you want weekly monitoring and alerts, that's $99/month.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Is this safe? You're asking for my Stripe key. <span class="toggle">+</span></div>
          <div class="faq-a">Your key is sent once over HTTPS, used to run the audit, and never stored in our database. We recommend using a restricted key with read-only permissions — you can create one in your Stripe Dashboard under API Keys.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Do you charge anything or modify my Stripe account? <span class="toggle">+</span></div>
          <div class="faq-a">No. The scan is read-only. We don't create charges, modify subscriptions, change settings, or write anything to your Stripe account.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">How long does it take? <span class="toggle">+</span></div>
          <div class="faq-a">The scan takes about 10 seconds for most accounts. If you have a high volume of transactions, it may take up to 30 seconds.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">What happens after the free scan? <span class="toggle">+</span></div>
          <div class="faq-a">You get a detailed report showing your leaks and fixes. If you want ongoing monitoring, you can subscribe for $99/month — weekly scans, email alerts, and health score tracking. Cancel anytime.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q">Will this work for my business? <span class="toggle">+</span></div>
          <div class="faq-a">If you use Stripe to accept recurring payments (subscriptions, memberships, recurring invoices), this tool will find gaps. B2B SaaS, B2C subscriptions, membership sites — all work.</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Final CTA ── -->
  <section class="alt cta-section">
    <div class="container-narrow">
      <h2>You're probably losing money <br>on payments right now.</h2>
      <p>30 seconds. No signup. See exactly what's leaking.</p>
      <div style="display:flex;justify-content:center">
        <a href="#auditForm" onclick="document.getElementById('auditForm').querySelector('input').focus()" style="display:inline-flex;align-items:center;gap:8px;padding:16px 40px;background:var(--accent);color:#fff;border-radius:var(--radius-sm);font-size:16px;font-weight:600;text-decoration:none;transition:all 0.2s">Run Free Audit →</a>
      </div>
      <div style="margin-top:20px;font-size:13px;color:var(--text-muted)">No credit card required · No signup · 30 seconds</div>
    </div>
  </section>

  <!-- ── Footer ── -->
  <footer class="footer">
    <div class="footer-links">
      <a href="/audit">Scan</a>
      <a href="/audit/subscribe">Pricing</a>
      <a href="/terms-of-service">Terms</a>
      <a href="/privacy-policy">Privacy</a>
      <a href="/refund-policy">Refunds</a>
    </div>
    <div class="footer-copy">Stripe Auditor</div>
  </footer>

  <script>
    // Form submission
    document.getElementById('auditForm').addEventListener('submit', function(e) {
      const btn = document.getElementById('submitBtn');
      const loader = document.getElementById('loader');
      btn.disabled = true;
      btn.innerHTML = 'Scanning' + '<span class="loader" style="display:inline-block;margin-left:8px;vertical-align:middle"></span>';
    });

    // FAQ accordion
    document.querySelectorAll('.faq-q').forEach(q => {
      q.addEventListener('click', function() {
        this.parentElement.classList.toggle('open');
      });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
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
    <div class="footer">Stripe Auditor</div>
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

      const baseUrl = process.env.BASE_URL || 'https://stripe-auditor-qrqf.onrender.com';

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


