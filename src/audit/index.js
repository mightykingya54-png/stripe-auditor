/**
 * Stripe Auditor — Audit Engine
 * 
 * Runs all audit checks against a Stripe account and returns
 * a combined report with findings, dollar amounts, and fix recommendations.
 * 
 * Usage:
 *   import { runAudit } from './audit/index.js';
 *   const report = await runAudit(stripeClient);
 */

import { checkRetries } from './checks/retries.js';
import { checkStuckSubscriptions } from './checks/stuck-subscriptions.js';
import { checkUncollectedInvoices } from './checks/uncollected-invoices.js';
import { checkFailedPayments } from './checks/failed-payments.js';
import { checkRecoveryPotential } from './checks/recovery-potential.js';

/**
 * Run all audit checks against a Stripe account.
 * @param {Object} stripe - Stripe client instance (authenticated)
 * @param {Object} [options]
 * @param {string} [options.merchantId] - Optional merchant ID for tracking
 * @returns {Object} Complete audit report
 */
export async function runAudit(stripe, options = {}) {
  const startTime = Date.now();
  const results = {};
  const errors = [];

  // Run checks sequentially (some depend on previous results)
  
  // Check 1: Retry Configuration
  try {
    results.retries = await checkRetries(stripe);
  } catch (err) {
    results.retries = { checkName: 'Retry Configuration', status: 'error', error: err.message };
    errors.push({ check: 'retries', error: err.message });
  }

  // Check 2: Stuck Subscriptions
  try {
    results.stuckSubscriptions = await checkStuckSubscriptions(stripe);
  } catch (err) {
    results.stuckSubscriptions = { checkName: 'Stuck Subscriptions', status: 'error', error: err.message };
    errors.push({ check: 'stuckSubscriptions', error: err.message });
  }

  // Check 3: Uncollected Invoices
  try {
    results.uncollectedInvoices = await checkUncollectedInvoices(stripe);
  } catch (err) {
    results.uncollectedInvoices = { checkName: 'Uncollected Invoices', status: 'error', error: err.message };
    errors.push({ check: 'uncollectedInvoices', error: err.message });
  }

  // Check 4: Failed Payment Analysis
  try {
    results.failedPayments = await checkFailedPayments(stripe);
  } catch (err) {
    results.failedPayments = { checkName: 'Failed Payment Analysis', status: 'error', error: err.message };
    errors.push({ check: 'failedPayments', error: err.message });
  }

  // Check 5: Recovery Potential (depends on previous results)
  try {
    results.recoveryPotential = await checkRecoveryPotential(stripe, results);
  } catch (err) {
    results.recoveryPotential = { checkName: 'Recovery Potential', status: 'error', error: err.message };
    errors.push({ check: 'recoveryPotential', error: err.message });
  }

  // Calculate totals
  let totalIssues = 0;
  let totalAtRisk = 0;

  for (const [key, result] of Object.entries(results)) {
    if (result.status === 'issues_found') {
      totalIssues += result.issuesFound || 0;
      totalAtRisk += result.totalPotentialLoss || result.totalAmount || result.totalRecoverable || 0;
    }
  }

  const duration = Date.now() - startTime;

  return {
    id: options.merchantId || `audit_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    durationMs: duration,
    summary: {
      totalChecks: Object.keys(results).length,
      passed: Object.values(results).filter(r => r.status === 'passed').length,
      issuesFound: Object.values(results).filter(r => r.status === 'issues_found').length,
      errors: Object.values(results).filter(r => r.status === 'error').length,
      totalIssues,
      totalAtRisk,
      totalAtRiskFormatted: '$' + (totalAtRisk / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    },
    checks: results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get a health score (0-100) from an audit report.
 * Higher = healthier billing setup.
 */
export function getHealthScore(report) {
  let score = 100;
  const deductions = {
    retries: report.checks?.retries?.issuesFound || 0,
    stuckSubscriptions: report.checks?.stuckSubscriptions?.issuesFound || 0,
    uncollectedInvoices: report.checks?.uncollectedInvoices?.issuesFound || 0,
    failedPayments: report.checks?.failedPayments?.issuesFound || 0,
  };

  // Deduct points based on issue severity
  if (deductions.retries > 0) score -= 10;
  if (deductions.stuckSubscriptions > 0) score -= 15 * Math.min(deductions.stuckSubscriptions, 5);
  if (deductions.uncollectedInvoices > 0) score -= 5 * Math.min(deductions.uncollectedInvoices, 5);
  if (deductions.failedPayments > 0) score -= 5 * Math.min(deductions.failedPayments, 5);

  return Math.max(0, score);
}
