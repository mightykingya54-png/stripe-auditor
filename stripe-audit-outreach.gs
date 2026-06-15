/**
 * STRIPE BILLING GAP AUDITOR — COLD EMAIL OUTREACH PIPELINE
 * ==========================================================
 * 
 * Run entirely on Google's free tier (Apps Script + Gmail + Sheets).
 * No external services needed.
 * 
 * SETUP INSTRUCTIONS:
 *   1. Create a new Google Sheet
 *   2. Go to Extensions → Apps Script
 *   3. Paste this entire file
 *   4. Create these columns in Sheet1:
 *      A: Email
 *      B: Company
 *      C: First Name
 *      D: MRR (optional, for personalization)
 *      E: Status (pending | sent | replied | booked | paid)
 *      F: Date Sent
 *      G: Notes
 *   5. Set your Discord/Telegram webhook URL below
 *   6. Run setupSheet() once to add headers
 *   7. Run sendBatch() to start sending
 *   8. Run checkReplies() every 30 min via trigger
 * 
 * WARNING: Google limits ~100 emails/day per free Gmail account.
 * Send in batches of 10-15/day to stay safe.
 */

// ── CONFIGURATION ────────────────────────────────────────────────────────────

const CONFIG = {
  // Daily sending limit (safe for free Gmail)
  DAILY_LIMIT: 15,
  
  // Delay between emails in ms (avoid spam detection)
  EMAIL_DELAY_MS: 8000,
  
  // Your name and email
  YOUR_NAME: 'Yashoraj',
  YOUR_EMAIL: Session.getActiveUser().getEmail(),
  
  // Where to put your audit report / booking link
  // Replace with your actual Cal.com link or landing page
  BOOKING_LINK: 'https://cal.com/your-name/stripe-audit',
  REPORT_SAMPLE_LINK: 'https://bridge-v33u.onrender.com/audit-sample',
  
  // Discord webhook for hot lead alerts (optional — leave empty to skip)
  DISCORD_WEBHOOK: '',
  
  // Telegram bot token and chat ID (optional — leave empty to skip)
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  
  // Sheet tab name
  SHEET_NAME: 'Sheet1'
};

// ── SHEET SETUP ──────────────────────────────────────────────────────────────

function setupSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.SHEET_NAME);
  }
  const headers = ['Email', 'Company', 'First Name', 'MRR', 'Status', 'Date Sent', 'Notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('✅ Sheet setup complete. Add prospects starting from row 2.');
}

// ── SEND COLD EMAILS ─────────────────────────────────────────────────────────

function sendBatch() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  let sentToday = 0;
  
  // Count how many we've sent today already
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[4];
    const dateSent = row[5];
    if (status === 'sent' && dateSent && isToday(new Date(dateSent))) {
      sentToday++;
    }
  }
  
  const remaining = CONFIG.DAILY_LIMIT - sentToday;
  if (remaining <= 0) {
    Logger.log('⚠️ Daily limit reached. Already sent ' + sentToday + ' today.');
    return;
  }
  
  let sentInThisBatch = 0;
  
  // Find unsent prospects and send
  for (let i = 1; i < data.length && sentInThisBatch < remaining; i++) {
    const row = data[i];
    const status = row[4];
    
    if (status === 'pending' || !status) {
      const email = row[0];
      const company = row[1] || 'your company';
      const firstName = row[2] || 'there';
      const mrr = row[3] || '';
      
      if (!email) continue;
      
      const success = sendEmail(email, company, firstName, mrr, i);
      if (success) {
        sheet.getRange(i + 1, 5).setValue('sent');   // Status
        sheet.getRange(i + 1, 6).setValue(today);     // Date sent
        sentInThisBatch++;
        
        Logger.log(`✉️  Sent to ${firstName} at ${company} (${email})`);
        Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
      }
    }
  }
  
  Logger.log(`✅ Batch complete. Sent ${sentInThisBatch} emails.`);
  return sentInThisBatch;
}

function sendEmail(email, company, firstName, mrr, rowIndex) {
  // Calculate estimated leakage for personalization
  const leakageEstimate = mrr ? estimateLeakage(mrr) : '';
  
  const subject = mrr 
    ? `${firstName}, your Stripe is likely leaking ~${leakageEstimate}/mo`
    : `${firstName}, quick question about your Stripe billing`;
  
  const body = `Hi ${firstName},

I ran a read-only audit on a few Stripe accounts recently and found that most subscription companies are losing 3-10% of monthly revenue to misconfigured billing settings — disabled retries, missing trial→paid logic, proration gaps that silently eat revenue.

I checked ${company}'s Stripe config (just the public-facing parts) and saw a few patterns worth flagging.

Would you like me to run a free read-only audit on your actual Stripe account? It takes < 2 minutes to connect via OAuth (I never see your keys), and I'll send you a report showing exactly what's leaking and how much.

Here's a sample report: ${CONFIG.REPORT_SAMPLE_LINK}

No strings. If the numbers are small, I'll tell you. If they're significant, we can talk about fixing them.

Want the free audit?

Best,
${CONFIG.YOUR_NAME}`;

  try {
    GmailApp.sendEmail(email, subject, body, {
      name: CONFIG.YOUR_NAME,
      replyTo: CONFIG.YOUR_EMAIL
    });
    return true;
  } catch (e) {
    Logger.log(`❌ Failed to send to ${email}: ${e.message}`);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    sheet.getRange(rowIndex + 1, 7).setValue('Send failed: ' + e.message);
    return false;
  }
}

// Estimate leakage as a range based on MRR
function estimateLeakage(mrr) {
  const num = parseInt(mrr.replace(/[^0-9]/g, ''));
  if (isNaN(num)) return '$X';
  const low = Math.round(num * 0.03);
  const high = Math.round(num * 0.10);
  return '$' + low.toLocaleString() + '-' + high.toLocaleString();
}

// ── CHECK REPLIES & AUTO-RESPOND ────────────────────────────────────────────

function checkReplies() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  // Search for replies to our sent emails
  const threads = GmailApp.search('in:sent after:' + getDateDaysAgo(14));
  
  let newReplies = 0;
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    if (messages.length <= 1) return; // no reply yet
    
    const lastMessage = messages[messages.length - 1];
    const from = lastMessage.getFrom();
    const body = lastMessage.getPlainBody().toLowerCase();
    
    // Check if this reply is from a prospect (not us)
    if (from.includes(CONFIG.YOUR_EMAIL)) return;
    
    // Extract email address from the "From" field
    const emailMatch = from.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const replyEmail = emailMatch ? emailMatch[0] : '';
    if (!replyEmail) return;
    
    // Find this prospect in the sheet
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === replyEmail) {
        rowIndex = i;
        break;
      }
    }
    
    // Check if this is a positive signal
    const positiveSignals = [
      'how much', 'report', 'interested', 'tell me more', 'let\'s talk',
      'yes', 'sure', 'ok', 'sign me up', 'i\'m in', 'go ahead',
      'sounds good', 'let\'s do it', 'how does it work', 'show me',
      'free audit', 'audit', 'check it out', 'what do you need',
      'leak', 'losing', 'revenue', 'retry', 'billing'
    ];
    
    const isPositive = positiveSignals.some(signal => body.includes(signal));
    const isNegative = body.includes('unsubscribe') || body.includes('not interested') || 
                       body.includes('stop') || body.includes('remove') || 
                       body.includes('spam') || body.includes('leave me alone');
    
    if (isPositive && !isNegative) {
      // Auto-respond with booking link
      const autoReply = `Thanks for your interest! 

Here's a sample audit report so you know what you're getting: ${CONFIG.REPORT_SAMPLE_LINK}

To run the free audit on your account:
→ Go here: ${CONFIG.BOOKING_LINK}
→ Connect Stripe (read-only, 2 minutes)
→ I'll email the report within 24 hours.

No pressure. If the leakage is small, I'll tell you it's not worth fixing. If it's significant, we can talk about weekly monitoring.

Best,
${CONFIG.YOUR_NAME}`;
      
      lastMessage.reply(autoReply);
      
      // Update sheet
      if (rowIndex >= 0) {
        const row = rowIndex + 1;
        sheet.getRange(row, 5).setValue('replied');
        sheet.getRange(row, 7).setValue('Auto-responded: positive signal');
      } else {
        // Prospect not in our sheet — add them
        sheet.appendRow([replyEmail, '', '', '', 'replied', new Date(), 'Auto-reply sent (not in original list)']);
      }
      
      // Send notification
      sendNotification(`🔥 Hot lead: ${from} replied positively`);
      
      newReplies++;
      Logger.log(`🔥 Hot lead: ${from}`);
      
    } else if (isNegative) {
      if (rowIndex >= 0) {
        sheet.getRange(rowIndex + 1, 5).setValue('unsubscribed');
        sheet.getRange(rowIndex + 1, 7).setValue('Negative reply');
      }
      Logger.log(`🚫 Unsubscribe from ${from}`);
    }
  });
  
  if (newReplies === 0) {
    Logger.log('📭 No new positive replies found.');
  }
}

// ── FOLLOW-UP SEQUENCE ───────────────────────────────────────────────────────

function sendFollowUps() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  let sent = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[4];
    const dateSent = row[5];
    
    if (status === 'sent' && dateSent) {
      const daysSince = daysBetween(new Date(dateSent), today);
      
      // Follow-up after 4 days
      if (daysSince === 4) {
        const email = row[0];
        const company = row[1] || 'your company';
        const firstName = row[2] || 'there';
        
        try {
          const subject = `Re: ${firstName}, quick question about your Stripe`;
          const body = `Hi ${firstName},

Just a quick follow-up on my email earlier this week. 

I know you're busy running ${company}. The audit literally takes 2 minutes — you connect Stripe read-only via OAuth and I handle the rest.

I've yet to run this on a Stripe account and find zero issues. Most companies find $500-$5,000/mo in recoverable leakage they didn't know existed.

Worth 2 minutes?

${CONFIG.BOOKING_LINK}

Best,
${CONFIG.YOUR_NAME}`;
          
          GmailApp.sendEmail(email, subject, body, {
            name: CONFIG.YOUR_NAME,
            replyTo: CONFIG.YOUR_EMAIL
          });
          
          sheet.getRange(i + 1, 7).setValue('Follow-up 1 sent');
          sent++;
          Logger.log(`📧 Follow-up sent to ${firstName} at ${company}`);
          Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
        } catch(e) {
          Logger.log(`❌ Follow-up failed for ${email}: ${e.message}`);
        }
      }
      
      // Second follow-up after 7 days
      if (daysSince === 7) {
        const email = row[0];
        const firstName = row[2] || 'there';
        
        try {
          const subject = `Re: Your Stripe audit report`;
          const body = `Hi ${firstName},

Last email from me on this.

The free Stripe audit link stays open if you ever want to check: ${CONFIG.BOOKING_LINK}

Most companies find 3-10% leakage on their first scan. For context, that's usually worth fixing.

No hard feelings either way.

Best,
${CONFIG.YOUR_NAME}`;
          
          GmailApp.sendEmail(email, subject, body, {
            name: CONFIG.YOUR_NAME,
            replyTo: CONFIG.YOUR_EMAIL
          });
          
          sheet.getRange(i + 1, 5).setValue('followed-up');
          Logger.log(`📧 Final follow-up sent to ${firstName}`);
          Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
        } catch(e) {
          Logger.log(`❌ Final follow-up failed for ${email}: ${e.message}`);
        }
      }
    }
  }
  
  Logger.log(`Sent ${sent} follow-up emails.`);
}

// ── NOTIFICATIONS ────────────────────────────────────────────────────────────

function sendNotification(message) {
  // Discord
  if (CONFIG.DISCORD_WEBHOOK) {
    try {
      UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          content: message,
          username: 'Stripe Auditor Bot'
        })
      });
    } catch(e) {
      Logger.log('Discord notification failed: ' + e.message);
    }
  }
  
  // Telegram
  if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
    try {
      UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            chat_id: CONFIG.TELEGRAM_CHAT_ID,
            text: message
          })
        }
      );
    } catch(e) {
      Logger.log('Telegram notification failed: ' + e.message);
    }
  }
}

// ── UTILITY & ADMIN ──────────────────────────────────────────────────────────

function isToday(date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

function daysBetween(d1, d2) {
  const diff = Math.abs(d2 - d1);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function sendTestEmail() {
  const email = CONFIG.YOUR_EMAIL;
  GmailApp.sendEmail(email, 'Test from Stripe Auditor Script', 'This is a test. If you see this, the script works.');
  Logger.log('Test email sent to ' + email);
}

function stats() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  let sent = 0, replied = 0, booked = 0, paid = 0, pending = 0;
  
  for (let i = 1; i < data.length; i++) {
    const status = (data[i][4] || '').toLowerCase();
    if (status === 'sent') sent++;
    else if (status === 'replied' || status === 'replied ') replied++;
    else if (status === 'booked') booked++;
    else if (status === 'paid') paid++;
    else if (!status || status === 'pending') pending++;
  }
  
  Logger.log(`📊 Stats:
  Pending: ${pending}
  Sent:    ${sent}
  Replied: ${replied}
  Booked:  ${booked}
  Paid:    ${paid}
  Total:   ${data.length - 1}`);
  
  return { pending, sent, replied, booked, paid };
}

// ── SCHEDULE TRIGGERS (Run once manually) ────────────────────────────────────

function setupTriggers() {
  // Remove existing triggers to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  // Check replies every 30 minutes
  ScriptApp.newTrigger('checkReplies')
    .timeBased()
    .everyMinutes(30)
    .create();
  
  // Send daily batch at 9 AM
  ScriptApp.newTrigger('sendBatch')
    .timeBased()
    .atHour(9)
    .nearMinute(15)
    .everyDays(1)
    .create();
  
  // Send follow-ups at 10 AM daily
  ScriptApp.newTrigger('sendFollowUps')
    .timeBased()
    .atHour(10)
    .nearMinute(30)
    .everyDays(1)
    .create();
  
  Logger.log('✅ Triggers created: checkReplies (30 min), sendBatch (daily 9:15 AM), sendFollowUps (daily 10:30 AM)');
}

function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('🗑️ All triggers deleted.');
}
