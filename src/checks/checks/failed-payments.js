/**
 * Check #4: Failed Payment Patterns Audit
 * 
 * Analyzes recent failed payment intents to identify patterns
 * (decline codes, card types, recurring vs one-off failures).
 */
export async function checkFailedPayments(stripe) {
  const declineCodes = {};
  let totalFailed = 0;
  let totalAmount = 0;
  const details = [];
  const uniqueCustomers = new Set();

  try {
    // Look at payment intents from last 30 days that failed
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        created: { gte: thirtyDaysAgo },
      };
      if (startingAfter) params.starting_after = startingAfter;

      const intents = await stripe.paymentIntents.list(params);

      for (const pi of intents.data) {
        // Only count failed intents
        if (pi.status === 'succeeded' || pi.status === 'processing') continue;
        if (!pi.last_payment_error) continue;

        const declineCode = pi.last_payment_error.decline_code || pi.last_payment_error.code || 'unknown';
        const amount = pi.amount || 0;
        
        declineCodes[declineCode] = (declineCodes[declineCode] || 0) + 1;
        totalFailed++;
        totalAmount += amount;

        if (pi.customer) {
          uniqueCustomers.add(pi.customer);
        }

        details.push({
          paymentIntentId: pi.id,
          customerId: pi.customer || 'guest',
          amount,
          amountFormatted: '$' + (amount / 100).toFixed(2),
          currency: pi.currency,
          declineCode,
          declineReason: pi.last_payment_error.message || declineCode,
          created: new Date(pi.created * 1000).toISOString().split('T')[0],
          hasCustomer: !!pi.customer,
        });
      }

      hasMore = intents.has_more;
      if (hasMore) {
        startingAfter = intents.data[intents.data.length - 1].id;
      }
    }

    // Also check invoice attempts that failed
    // (Stripe doesn't surface these via invoice.list, but we can check
    //  via the invoice's latest_attempt)
  } catch (err) {
    return {
      checkName: 'Failed Payment Analysis',
      status: 'error',
      error: err.message,
    };
  }

  // Categorize the top decline codes
  const topCodes = Object.entries(declineCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count, percentage: Math.round((count / totalFailed) * 100) }));

  const uniqueCustomerCount = uniqueCustomers.size;
  const avgTriesPerCustomer = uniqueCustomerCount > 0
    ? (totalFailed / uniqueCustomerCount).toFixed(1)
    : 'N/A';

  const status = totalFailed > 0 ? 'issues_found' : 'passed';
  return {
    checkName: 'Failed Payment Analysis',
    status,
    summary: totalFailed > 0
      ? `Found ${totalFailed} failed payment(s) in the last 30 days totaling ${'$' + (totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : 'No failed payments in the last 30 days',
    issuesFound: totalFailed,
    totalAmount,
    totalAmountFormatted: '$' + (totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    uniqueCustomers: uniqueCustomerCount,
    avgTriesPerCustomer,
    topDeclineCodes: topCodes,
    details,
    fix: totalFailed > 0
      ? `Top decline codes: ${topCodes.slice(0, 3).map(c => `${c.code} (${c.count}x)`).join(', ')}. Enable Stripe Smart Retries to recover card_declined and expired_card failures. For generic_decline, ask customers to use a different card. Consider Stripe's account updater for expired cards.`
      : 'No action needed.',
  };
}
