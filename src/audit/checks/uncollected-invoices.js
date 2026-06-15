/**
 * Check #3: Uncollected Invoices Audit
 * 
 * Finds invoices that are past_due or open (unpaid) and calculates
 * the total outstanding revenue.
 */
export async function checkUncollectedInvoices(stripe) {
  let totalAmount = 0;
  let totalCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  const details = [];

  try {
    // Check open (unpaid, not yet past due) invoices
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = {
        limit: 100,
        status: 'open',
        expand: ['data.subscription'],
      };
      if (startingAfter) params.starting_after = startingAfter;

      const invoices = await stripe.invoices.list(params);
      
      for (const inv of invoices.data) {
        const amount = inv.total || inv.amount_due || 0;
        const daysOld = Math.floor((Date.now() / 1000 - inv.created) / 86400);
        
        totalCount++;
        totalAmount += amount;

        // Invoices over 7 days are "overdue"
        if (daysOld > 7) {
          overdueCount++;
          overdueAmount += amount;
        }

        details.push({
          invoiceId: inv.id,
          customerId: inv.customer,
          amount,
          amountFormatted: '$' + (amount / 100).toFixed(2),
          currency: inv.currency,
          created: new Date(inv.created * 1000).toISOString().split('T')[0],
          daysOpen: daysOld,
          autoAdvance: inv.auto_advance,
          subscriptionId: inv.subscription || null,
        });
      }

      hasMore = invoices.has_more;
      if (hasMore) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
      }
    }



  } catch (err) {
    return {
      checkName: 'Uncollected Invoices',
      status: 'error',
      error: err.message,
    };
  }

  const status = totalCount > 0 ? 'issues_found' : 'passed';
  return {
    checkName: 'Uncollected Invoices',
    status,
    summary: totalCount > 0
      ? `Found ${totalCount} unpaid invoice(s) totaling ${'$' + (totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : 'No unpaid invoices found',
    issuesFound: totalCount,
    overdueCount,
    totalAmount,
    totalAmountFormatted: '$' + (totalAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    overdueAmount,
    overdueAmountFormatted: '$' + (overdueAmount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    details,
    fix: totalCount > 0
      ? `Send payment reminders for ${totalCount} unpaid invoice(s). Enable Stripe's automatic collection workflows. For overdue invoices (${overdueCount}), reach out to customers directly.`
      : 'No action needed.',
  };
}
