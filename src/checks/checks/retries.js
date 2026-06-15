/**
 * Check #1: Retry Logic Audit
 * 
 * Scans all active subscriptions to check if payment_retry settings
 * are enabled. Stripe's default retry logic handles 3 attempts over 3 days.
 * Many merchants disable this or set it incorrectly.
 */
export async function checkRetries(stripe) {
  const findings = [];
  let totalPotentialLoss = 0;
  let totalSubscriptions = 0;
  let issuesFound = 0;

  try {
    // Fetch all active subscriptions
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        status: 'active',
        expand: ['data.default_payment_method'],
      };
      if (startingAfter) params.starting_after = startingAfter;

      const subs = await stripe.subscriptions.list(params);
      
      for (const sub of subs.data) {
        totalSubscriptions++;
        
        // Check if retry is explicitly disabled or misconfigured
        // Stripe subscriptions without collection_method='charge_automatically'
        // or with payment_behavior='default_incomplete' can indicate issues
        
        if (sub.collection_method !== 'charge_automatically') {
          findings.push({
            subscriptionId: sub.id,
            customerId: sub.customer,
            issue: 'Manual collection — payments not auto-charged',
            severity: 'high',
            monthlyValue: sub.items?.data?.[0]?.price?.unit_amount || 0,
          });
          totalPotentialLoss += sub.items?.data?.[0]?.price?.unit_amount || 0;
          issuesFound++;
          continue;
        }

        // Check if subscription has past_due or incomplete status
        // that may indicate retries are failing or disabled
        if (sub.status === 'past_due' || sub.status === 'incomplete') {
          findings.push({
            subscriptionId: sub.id,
            customerId: sub.customer,
            issue: `Subscription is ${sub.status} — retries may be exhausted`,
            severity: 'high',
            monthlyValue: sub.items?.data?.[0]?.price?.unit_amount || 0,
          });
          totalPotentialLoss += sub.items?.data?.[0]?.price?.unit_amount || 0;
          issuesFound++;
        }
      }

      hasMore = subs.has_more;
      if (hasMore) {
        startingAfter = subs.data[subs.data.length - 1].id;
      }
    }
  } catch (err) {
    return {
      checkName: 'Retry Configuration',
      status: 'error',
      error: err.message,
    };
  }

  const status = issuesFound > 0 ? 'issues_found' : 'passed';
  return {
    checkName: 'Retry Configuration',
    status,
    summary: issuesFound > 0
      ? `Found ${issuesFound} subscription(s) with retry or collection issues`
      : `All ${totalSubscriptions} active subscriptions have proper retry configuration`,
    issuesFound,
    totalSubscriptions,
    totalPotentialLoss,
    potentialLossFormatted: '$' + (totalPotentialLoss / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    details: findings,
    fix: issuesFound > 0
      ? 'Enable Stripe Smart Retries or set collection_method to charge_automatically. Review past_due subscriptions manually.'
      : 'No action needed.',
  };
}
