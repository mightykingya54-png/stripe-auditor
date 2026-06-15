/**
 * HTML Report Generator for Stripe Auditor
 * 
 * Takes a raw audit result and generates a clean, readable HTML page
 * showing all findings with dollar amounts and fix recommendations.
 */

export function generateReportHtml(auditResult, merchantInfo = {}) {
  const { summary, checks, generatedAt } = auditResult;
  const healthScore = auditResult.summary?.issuesFound > 0
    ? Math.max(0, 100 - auditResult.summary.issuesFound * 5)
    : 100;

  const healthColor = healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#f59e0b' : '#ef4444';
  const healthLabel = healthScore >= 80 ? 'Good' : healthScore >= 50 ? 'Needs Attention' : 'Critical';

  const rows = [];
  
  // Build check rows
  for (const [key, check] of Object.entries(checks)) {
    if (check.status === 'error') {
      rows.push(`<tr><td>${check.checkName}</td><td style="color:#ef4444">Error</td><td>${check.error}</td><td>-</td></tr>`);
      continue;
    }

    const statusIcon = check.status === 'passed' ? '✅' : check.status === 'issues_found' ? '⚠️' : '❌';
    const amount = check.potentialLossFormatted || check.totalAmountFormatted || check.totalRecoverableFormatted || '$0';
    const summaryText = check.summary || 'No issues';
    
    rows.push(`<tr>
      <td>${statusIcon} ${check.checkName}</td>
      <td style="color:${check.status === 'passed' ? '#22c55e' : '#ef4444'}">${check.status === 'passed' ? 'Passed' : check.status === 'issues_found' ? `${check.issuesFound} issue(s)` : 'Error'}</td>
      <td>${summaryText}</td>
      <td style="font-weight:600;color:${check.status === 'issues_found' ? '#ef4444' : '#22c55e'}">${check.status === 'issues_found' ? amount : '$0'}</td>
    </tr>`);
  }

  // Recovery breakdown
  let recoveryHtml = '';
  const recovery = checks.recoveryPotential;
  if (recovery && recovery.breakdown && recovery.breakdown.length > 0) {
    recoveryHtml = recovery.breakdown.map(b => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9">
        <span>${b.source}</span>
        <span style="font-weight:600;color:#22c55e">+${b.recoverableFormatted} (${b.recoveryRate})</span>
      </div>
    `).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stripe Billing Audit — ${merchantInfo.businessName || 'Report'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }
    .container { max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    .header { text-align: center; padding: 32px 0; }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header p { color: #64748b; margin-top: 8px; }
    .score-ring { display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 96px; border-radius: 50%; margin: 16px auto; font-size: 24px; font-weight: 700; color: white; }
    .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .stat-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .stat-box { flex: 1; min-width: 120px; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-box .value { font-size: 24px; font-weight: 700; }
    .stat-box .label { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-box.danger .value { color: #ef4444; }
    .stat-box.success .value { color: #22c55e; }
    .stat-box.warning .value { color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    th { font-weight: 600; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .fix-box { background: #f0f9ff; border-left: 3px solid #3b82f6; border-radius: 4px; padding: 12px; margin-top: 12px; font-size: 13px; color: #1e293b; line-height: 1.5; }
    .cta { text-align: center; padding: 32px 0; }
    .cta h3 { font-size: 20px; margin-bottom: 8px; }
    .cta p { color: #64748b; margin-bottom: 16px; }
    .btn { display: inline-block; padding: 12px 32px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .btn:hover { background: #4f46e5; }
    .footer { text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px; }
    .meta { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 8px; }
    @media (max-width: 600px) {
      .stat-row { flex-direction: column; }
      table { font-size: 12px; }
      th, td { padding: 6px 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="score-ring" style="background:${healthColor}">${healthScore}</div>
      <h1>Stripe Billing Audit</h1>
      <p>${merchantInfo.businessName || 'Your Account'} · ${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <div class="meta">Health: ${healthLabel} · ${summary.totalChecks} checks run in ${(auditResult.durationMs / 1000).toFixed(1)}s</div>
    </div>

    <div class="card">
      <h2>Summary</h2>
      <div class="stat-row">
        <div class="stat-box ${summary.issuesFound > 0 ? 'danger' : 'success'}">
          <div class="value">${summary.issuesFound || 0}</div>
          <div class="label">Issues Found</div>
        </div>
        <div class="stat-box ${summary.errors > 0 ? 'warning' : 'success'}">
          <div class="value">${summary.passed || 0}</div>
          <div class="label">Checks Passed</div>
        </div>
        <div class="stat-box danger">
          <div class="value">${summary.totalAtRiskFormatted || '$0'}</div>
          <div class="label">Revenue at Risk</div>
        </div>
        <div class="stat-box success">
          <div class="value">${recovery?.monthlyRecoverableFormatted || '$0'}</div>
          <div class="label">Recoverable/Month</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Check Results</h2>
      <table>
        <thead>
          <tr><th>Check</th><th>Status</th><th>Finding</th><th>Amount</th></tr>
        </thead>
        <tbody>
          ${rows.join('\n')}
        </tbody>
      </table>
    </div>

    ${recovery && recovery.breakdown && recovery.breakdown.length > 0 ? `
    <div class="card">
      <h2>Recovery Breakdown</h2>
      ${recoveryHtml}
      <div style="display:flex;justify-content:space-between;padding:12px 0 0;font-weight:700;font-size:16px;border-top:2px solid #e2e8f0;margin-top:8px">
        <span>Total Recoverable</span>
        <span style="color:#22c55e">${recovery.totalRecoverableFormatted}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-top:4px">
        <span>Monthly recurring opportunity</span>
        <span style="color:#f59e0b">${recovery.monthlyRecoverableFormatted}/mo</span>
      </div>
    </div>` : ''}

    <div class="card">
      <h2>Recommended Fixes</h2>
      ${checks.retries?.fix ? `<div class="fix-box"><strong>Retry Configuration:</strong> ${checks.retries.fix}</div>` : ''}
      ${checks.stuckSubscriptions?.fix ? `<div class="fix-box" style="margin-top:8px"><strong>Stuck Subscriptions:</strong> ${checks.stuckSubscriptions.fix}</div>` : ''}
      ${checks.uncollectedInvoices?.fix ? `<div class="fix-box" style="margin-top:8px"><strong>Uncollected Invoices:</strong> ${checks.uncollectedInvoices.fix}</div>` : ''}
      ${checks.failedPayments?.fix ? `<div class="fix-box" style="margin-top:8px"><strong>Failed Payments:</strong> ${checks.failedPayments.fix}</div>` : ''}
      ${checks.recoveryPotential?.fix ? `<div class="fix-box" style="margin-top:8px"><strong>Recovery Plan:</strong> ${checks.recoveryPotential.fix}</div>` : ''}
    </div>

    <div class="cta">
      <h3>This was your free scan</h3>
      <p>Subscribe to weekly monitoring to track changes, get alerts, and measure recovery progress.</p>
      <a href="/audit/subscribe" class="btn">Subscribe — $99/mo</a>
    </div>

    <div class="footer">
      Stripe Auditor · Read-only scan · No data stored · ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;

  return html;
}
