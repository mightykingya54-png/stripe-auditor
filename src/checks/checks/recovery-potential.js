/**
 * Check #5: Recovery Potential Estimate
 * 
 * Estimates how much revenue could be recovered by fixing the issues
 * identified in the other checks. Combines retry recovery, failed payment
 * recovery, and stuck subscription reactivation.
 * 
 * Recovery rates based on Stripe benchmarks:
 *   - Smart Retries recover ~40-60% of initially failed payments
 *   - Manual outreach recovers ~20-30% of stuck subscriptions
 *   - Invoice reminders recover ~30% of uncollected invoices
 */
export async function checkRecoveryPotential(stripe, previousResults = {}) {
  let totalRecoverable = 0;
  const breakdown = [];

  try {
    // 1. Estimate from stuck subscriptions
    const stuckResult = previousResults.stuckSubscriptions;
    if (stuckResult && stuckResult.totalPotentialLoss) {
      // Rough estimate: 25% of stuck subs could be reactivated
      const recoverableFromStuck = Math.round(stuckResult.totalPotentialLoss * 0.25);
      totalRecoverable += recoverableFromStuck;
      breakdown.push({
        source: 'Stuck subscription reactivation',
        recoverable: recoverableFromStuck,
        recoverableFormatted: '$' + (recoverableFromStuck / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        recoveryRate: '25%',
        note: 'Manual outreach to customers with past_due subscriptions',
      });
    }

    // 2. Estimate from failed payments
    const failedResult = previousResults.failedPayments;
    if (failedResult && failedResult.totalAmount) {
      // Failures with card_declined or expired_card have ~50% recovery rate
      const failures = failedResult.details || [];
      const recoverableFailures = failures.filter(f => {
        const recoverableCodes = ['card_declined', 'expired_card', 'processing_error', 'incorrect_number'];
        return recoverableCodes.includes(f.declineCode);
      });
      const recoverableAmount = recoverableFailures.reduce((sum, f) => sum + f.amount, 0);
      const recovered = Math.round(recoverableAmount * 0.50);
      totalRecoverable += recovered;
      breakdown.push({
        source: 'Failed payment retry recovery',
        recoverable: recovered,
        recoverableFormatted: '$' + (recovered / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        recoveryRate: '50%',
        note: 'Smart Retries can recover card_declined and expired_card failures',
        recoverableAttempts: recoverableFailures.length,
      });
    }

    // 3. Estimate from uncollected invoices
    const invoiceResult = previousResults.uncollectedInvoices;
    if (invoiceResult && invoiceResult.totalAmount) {
      // ~30% of open invoices can be collected with reminders
      const recoverableFromInvoices = Math.round(invoiceResult.totalAmount * 0.30);
      totalRecoverable += recoverableFromInvoices;
      breakdown.push({
        source: 'Invoice collection recovery',
        recoverable: recoverableFromInvoices,
        recoverableFormatted: '$' + (recoverableFromInvoices / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        recoveryRate: '30%',
        note: 'Automated payment reminders for open/past_due invoices',
      });
    }

    // 4. Estimate from retry config
    const retryResult = previousResults.retries;
    if (retryResult && retryResult.totalPotentialLoss) {
      // If retries are disabled entirely, ~40% of that amount could be recovered
      const recoverableFromRetries = Math.round(retryResult.totalPotentialLoss * 0.40);
      totalRecoverable += recoverableFromRetries;
      breakdown.push({
        source: 'Retry configuration fix',
        recoverable: recoverableFromRetries,
        recoverableFormatted: '$' + (recoverableFromRetries / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        recoveryRate: '40%',
        note: 'Enabling Smart Retries for subscriptions with disabled retry logic',
      });
    }

    const monthlyRecoverable = Math.round(totalRecoverable / 3); // rough monthly

    return {
      checkName: 'Recovery Potential',
      status: totalRecoverable > 0 ? 'issues_found' : 'passed',
      summary: totalRecoverable > 0
        ? `Estimated recoverable revenue: ${'$' + (totalRecoverable / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${'$' + (monthlyRecoverable / 100).toFixed(2)}/mo)`
        : 'No significant recovery opportunities found',
      totalRecoverable,
      totalRecoverableFormatted: '$' + (totalRecoverable / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      monthlyRecoverable,
      monthlyRecoverableFormatted: '$' + (monthlyRecoverable / 100).toFixed(2),
      breakdown,
      fix: totalRecoverable > 0
        ? `You could recover approximately ${'$' + (totalRecoverable / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} by implementing the fixes above. Subscribe to weekly monitoring to track recovery progress.`
        : 'No action needed.',
    };
  } catch (err) {
    return {
      checkName: 'Recovery Potential',
      status: 'error',
      error: err.message,
    };
  }
}
