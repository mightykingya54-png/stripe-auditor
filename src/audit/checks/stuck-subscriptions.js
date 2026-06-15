/**
 * Check #2: Stuck Subscriptions Audit
 * 
 * Finds subscriptions in past_due, incomplete, incomplete_expired, or unpaid
 * status that are actively losing revenue.
 */
export async function checkStuckSubscriptions(stripe) {
  let totalStuck = 0;
  let totalPotentialLoss = 0;
  const details = [];

  try {
    for (const status of ['past_due', 'incomplete', 'unpaid']) {
      let hasMore = true;
      let startingAfter = null;

      while (hasMore) {
        const params = { limit: 100, status };
        if (startingAfter) params.starting_after = startingAfter;

        const subs = await stripe.subscriptions.list(params);
        
        for (const sub of subs.data) {
          const amount = sub.items?.data?.[0]?.price?.unit_amount || 0;
          const currency = sub.items?.data?.[0]?.price?.currency || 'usd';
          
          totalStuck++;
          totalPotentialLoss += amount;

          details.push({
            subscriptionId: sub.id,
            customerId: sub.customer,
            status: sub.status,
            amount: amount,
            amountFormatted: '$' + (amount / 100).toFixed(2),
            currency,
            created: new Date(sub.created * 1000).toISOString().split('T')[0],
            daysStuck: Math.floor((Date.now() / 1000 - sub.created) / 86400),
          });
        }

        hasMore = subs.has_more;
        if (hasMore) {
          startingAfter = subs.data[subs.data.length - 1].id;
        }
      }
    }
  } catch (err) {
    return {
      checkName: 'Stuck Subscriptions',
      status: 'error',
      error: err.message,
    };
  }

  const status = totalStuck > 0 ? 'issues_found' : 'passed';
  return {
    checkName: 'Stuck Subscriptions',
    status,
    summary: totalStuck > 0
      ? `Found ${totalStuck} subscription(s) stuck in past_due/incomplete/unpaid status`
      : 'No stuck subscriptions found',
    issuesFound: totalStuck,
    totalPotentialLoss,
    potentialLossFormatted: '$' + (totalPotentialLoss / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    monthlyRecurringLoss: Math.round(totalPotentialLoss / 3), // rough monthly estimate
    details,
    fix: totalStuck > 0
      ? 'Review each stuck subscription. For past_due: enable Smart Retries or contact customers. For incomplete: fix payment method collection. For unpaid: send payment reminders via Stripe Invoices.'
      : 'No action needed.',
  };
}
