/**
 * STRIPE BILLING GAP AUDITOR — SOCIAL LISTENING + OUTREACH SYSTEM
 * ==============================================================
 * 
 * Two-channel approach:
 *   CHANNEL A — Social Listening (PRIMARY) — Monitor Reddit for founders 
 *               actively complaining about Stripe payment issues. Reach out
 *               when they're already in pain. (Based on DunnAI's finding:
 *               "Outreach to someone complaining works immediately.")
 * 
 *   CHANNEL B — Cold Email (SECONDARY) — Only for founders who have 
 *               publicly posted about Stripe issues recently.
 * 
 * Run entirely on Google's free tier. $0 to operate.
 * 
 * SETUP:
 *   1. Create a new Google Sheet with two tabs:
 *      - "SocialLeads"  (auto-populated by Reddit monitor)
 *      - "ColdEmail"    (manual prospect list for optional email)
 *   2. Go to Extensions → Apps Script → Paste this file
 *   3. Configure CONFIG section below
 *   4. Run setupSheet() once
 *   5. Run setupTriggers() once
 *   6. Done — monitor runs automatically every 30 min
 * 
 * MANUAL DAILY TASKS (5 min):
 *   - Check SocialLeads sheet for new Reddit leads
 *   - Run Twitter/IH searches (guide at bottom of this file)
 *   - Reply to each lead referencing their specific complaint
 */

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ── Your Info ──
  YOUR_NAME: 'Yashoraj',
  YOUR_EMAIL: 'yashanare193@gmail.com',
  
  // ── Links ──
  AUDIT_LINK: 'https://bridge-v33u.onrender.com/audit',

  SUBSCRIBE_LINK: 'https://bridge-v33u.onrender.com/audit/subscribe',
  // ── Notifications (optional — leave empty to skip) ──
  DISCORD_WEBHOOK: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  
  // ── Reddit Monitor ──
  REDDIT_SUBREDDITS: ['SaaS', 'Stripe', 'startups', 'indiebiz', 'entrepreneur'],
  REDDIT_KEYWORDS: [
    'failed payment',
    'failed payments', 
    'stripe churn',
    'involuntary churn',
    'payment retry',
    'stripe billing',
    'lost revenue stripe',
    'subscription churn',
    'declined payment',
    'dunning',
    'stripe subscription'
  ],
  REDDIT_MAX_POSTS_PER_SEARCH: 25,  // keep low to avoid rate limits
  
  // ── Cold Email (optional secondary channel) ──
  DAILY_EMAIL_LIMIT: 15,
  EMAIL_DELAY_MS: 8000,
  
  // ── Sheet Names ──
  SOCIAL_SHEET: 'SocialLeads',
  COLD_SHEET: 'ColdEmail'
};

// ═════════════════════════════════════════════════════════════════════════════
// SHEET SETUP
// ═════════════════════════════════════════════════════════════════════════════

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Social Leads sheet
  let socialSheet = ss.getSheetByName(CONFIG.SOCIAL_SHEET);
  if (!socialSheet) {
    socialSheet = ss.insertSheet(CONFIG.SOCIAL_SHEET);
  }
  socialSheet.getRange(1, 1, 1, 10).setValues([[
    'Timestamp', 'Source', 'Post Title', 'Post URL', 'Author',
    'Subreddit', 'Content Snippet', 'Status', 'Date Contacted', 'Notes'
  ]]);
  socialSheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  socialSheet.setFrozenRows(1);
  socialSheet.setColumnWidths(1, 10, 200);
  
  // Cold Email sheet (optional)
  let coldSheet = ss.getSheetByName(CONFIG.COLD_SHEET);
  if (!coldSheet) {
    coldSheet = ss.insertSheet(CONFIG.COLD_SHEET);
  }
  coldSheet.getRange(1, 1, 1, 7).setValues([[
    'Email', 'Company', 'First Name', 'MRR', 'Status', 'Date Sent', 'Notes'
  ]]);
  coldSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  coldSheet.setFrozenRows(1);
  
  Logger.log('✅ Sheets setup complete.');
}

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL A: REDDIT SOCIAL LISTENING (PRIMARY)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Monitor Reddit for Stripe payment complaint posts.
 * Run every 30 minutes via trigger.
 * Uses Reddit's public JSON API — no API key needed.
 */
function monitorReddit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SOCIAL_SHEET);
  const seenPosts = getSeenPosts();
  let newPosts = 0;
  
  CONFIG.REDDIT_SUBREDDITS.forEach(subreddit => {
    // Build search query from keywords
    const query = CONFIG.REDDIT_KEYWORDS.join(' OR ');
    const url = `https://www.reddit.com/r/${subreddit}/search.json`
      + `?q=${encodeURIComponent(query)}`
      + `&sort=new`
      + `&t=day`
      + `&restrict_sr=1`
      + `&limit=${CONFIG.REDDIT_MAX_POSTS_PER_SEARCH}`;
    
    try {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'StripeGapAuditor/1.0 (social listening bot)' }
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`⚠️ Reddit API error for r/${subreddit}: ${response.getResponseCode()}`);
        return;
      }
      
      const data = JSON.parse(response.getContentText());
      const posts = data.data?.children || [];
      
      posts.forEach(child => {
        const post = child.data;
        const postId = post.id;
        
        // Skip if already seen
        if (seenPosts.has(postId)) return;
        seenPosts.add(postId);
        
        // Skip stickied posts, mod posts, etc.
        if (post.stickied || post.distinguished) return;
        
        // Extract relevant info
        const title = post.title || '';
        const author = post.author || '[deleted]';
        const permalink = post.permalink || '';
        const url = `https://www.reddit.com${permalink}`;
        const selftext = (post.selftext || '').substring(0, 300); // snippet
        const created = new Date(post.created_utc * 1000);
        const score = post.score || 0;
        const numComments = post.num_comments || 0;
        
        // Skip low-effort posts (score < 1 and no comments)
        if (score < 1 && numComments === 0) return;
        
        // Log to sheet
        sheet.appendRow([
          created, 'Reddit', title, url, author,
          `r/${subreddit}`, selftext, 'new', '', ''
        ]);
        
        newPosts++;
        
        // Send notification
        const titleSnippet = title.length > 100 ? title.substring(0, 100) + '...' : title;
        sendNotification(
          `🔴 New Reddit lead in r/${subreddit}: "${titleSnippet}"\n`
          + `Score: ${score} | Comments: ${numComments}\n`
          + `URL: ${url}`
        );
        
        Logger.log(`🔴 New Reddit lead: r/${subreddit} — "${titleSnippet}"`);
      });
      
    } catch (e) {
      Logger.log(`❌ Reddit monitor error for r/${subreddit}: ${e.message}`);
    }
  });
  
  // Save seen posts (cleanup old ones to keep size manageable)
  saveSeenPosts(seenPosts);
  
  Logger.log(`✅ Reddit monitor complete. Found ${newPosts} new leads.`);
  return newPosts;
}

/**
 * Get set of already-seen Reddit post IDs from PropertiesService.
 */
function getSeenPosts() {
  const props = PropertiesService.getScriptProperties();
  const stored = props.getProperty('SEEN_REDDIT_POSTS');
  return new Set(JSON.parse(stored || '[]'));
}

/**
 * Save seen Reddit post IDs, keeping only last 5000 to avoid size limits.
 */
function saveSeenPosts(seenSet) {
  const props = PropertiesService.getScriptProperties();
  const arr = Array.from(seenSet);
  // Keep only last 5000
  const trimmed = arr.slice(-5000);
  props.setProperty('SEEN_REDDIT_POSTS', JSON.stringify(trimmed));
}

// ═════════════════════════════════════════════════════════════════════════════
// OUTREACH TEMPLATE — SOCIAL LISTENING LEADS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Copy-paste this template when reaching out to a lead who posted
 * about a Stripe/payment issue on Reddit, Twitter, or Indie Hackers.
 * 
 * CRITICAL RULE (from DunnAI's experiment):
 *   "Outreach to someone who just said 'this is costing me revenue'
 *    works immediately."
 * 
 * So reference their specific complaint. Don't pitch — offer a fix.
 */
const SOCIAL_OUTREACH_TEMPLATE = `Hi [Author],

Saw your post on [Source] about [their specific complaint — e.g., Stripe failed payments eating your revenue].

I built a free tool that does a read-only scan of your Stripe account and shows exactly:
• Which subscriptions are failing and why
• How much revenue you're losing to failed payments
• What specific billing settings are misconfigured

It takes 30 seconds — paste your Stripe secret key (read-only, not stored), and you get an instant report with dollar amounts and fix recommendations.

Here's the tool: https://bridge-v33u.onrender.com/audit

No strings, no signup.

Best,
Yashoraj`;

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL B: COLD EMAIL (SECONDARY — ONLY FOR WARM LEADS)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send cold emails to prospect list.
 * Use ONLY for founders who have publicly posted about Stripe issues,
 * or who are warm intros. Do NOT blast generic lists.
 */
function sendBatch() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.COLD_SHEET);
  if (!sheet) {
    Logger.log('⚠️ ColdEmail sheet not found. Run setupSheet() first.');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  let sentToday = 0;
  
  // Count today's sends
  for (let i = 1; i < data.length; i++) {
    const status = data[i][4];
    const dateSent = data[i][5];
    if (status === 'sent' && dateSent && isToday(new Date(dateSent))) {
      sentToday++;
    }
  }
  
  const remaining = CONFIG.DAILY_EMAIL_LIMIT - sentToday;
  if (remaining <= 0) {
    Logger.log('⚠️ Daily cold email limit reached (' + sentToday + ' sent today).');
    return;
  }
  
  let sentInThisBatch = 0;
  
  for (let i = 1; i < data.length && sentInThisBatch < remaining; i++) {
    const row = data[i];
    const status = row[4];
    
    if (status === 'pending' || !status) {
      const email = row[0];
      const company = row[1] || 'your company';
      const firstName = row[2] || 'there';
      const mrr = row[3] || '';
      
      if (!email) continue;
      
      const success = sendColdEmail(email, company, firstName, mrr, i);
      if (success) {
        sheet.getRange(i + 1, 5).setValue('sent');
        sheet.getRange(i + 1, 6).setValue(today);
        sentInThisBatch++;
        Logger.log(`✉️  Cold email sent to ${firstName} at ${company} (${email})`);
        Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
      }
    }
  }
  
  Logger.log(`✅ Cold email batch complete. Sent ${sentInThisBatch} emails.`);
}

function sendColdEmail(email, company, firstName, mrr, rowIndex) {
  const leakage = mrr ? estimateLeakage(mrr) : '';
  const subject = leakage
    ? `${firstName}, your Stripe is likely leaking ~${leakage}/mo`
    : `${firstName}, quick question about your Stripe billing`;
  
  const body = `Hi ${firstName},

I saw that ${company} runs on Stripe. I've been scanning subscription companies and found that most are losing 3-10% of monthly revenue to billing configuration gaps — disabled retries, missing trial→paid logic, silent proration issues.

I built a free tool that does a read-only audit of your Stripe account and shows exactly what's leaking and how much. Takes 2 minutes.

Free instant audit: ${CONFIG.AUDIT_LINK}

Want the free audit? No strings.

Best,
${CONFIG.YOUR_NAME}`;

  try {
    GmailApp.sendEmail(email, subject, body, {
      name: CONFIG.YOUR_NAME,
      replyTo: CONFIG.YOUR_EMAIL
    });
    return true;
  } catch (e) {
    Logger.log(`❌ Cold email failed for ${email}: ${e.message}`);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.COLD_SHEET);
    sheet.getRange(rowIndex + 1, 7).setValue('Send failed: ' + e.message);
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// REPLY CHECKER (works for both channels)
// ═════════════════════════════════════════════════════════════════════════════

function checkReplies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const coldSheet = ss.getSheetByName(CONFIG.COLD_SHEET);
  const data = coldSheet ? coldSheet.getDataRange().getValues() : [];
  
  const threads = GmailApp.search('in:sent after:' + getDateDaysAgo(14));
  let newReplies = 0;
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    if (messages.length <= 1) return;
    
    const lastMessage = messages[messages.length - 1];
    const from = lastMessage.getFrom();
    const body = lastMessage.getPlainBody().toLowerCase();
    
    if (from.includes(CONFIG.YOUR_EMAIL)) return;
    
    const emailMatch = from.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const replyEmail = emailMatch ? emailMatch[0] : '';
    if (!replyEmail) return;
    
    // Find in sheet
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === replyEmail) {
        rowIndex = i;
        break;
      }
    }
    
    // Check sentiment
    const positive = ['yes', 'sure', 'interested', 'tell me more', 'how much',
      'report', 'let\'s talk', 'sounds good', 'audit', 'leak', 'losing'].some(
      s => body.includes(s));
    const negative = ['unsubscribe', 'not interested', 'stop', 'spam',
      'leave me alone'].some(s => body.includes(s));
    
    if (positive && !negative) {
      // Auto-respond
      const reply = `Thanks for the interest! 

Here's the free audit tool (instant, no signup): ${CONFIG.AUDIT_LINK}

Paste your Stripe secret key (read-only, not stored), and you get the report in ~10 seconds.

Best,
${CONFIG.YOUR_NAME}`;
      
      lastMessage.reply(reply);
      
      if (rowIndex >= 0) {
        coldSheet.getRange(rowIndex + 1, 5).setValue('replied');
        coldSheet.getRange(rowIndex + 1, 7).setValue('Auto-responded: positive');
      }
      
      sendNotification(`🔥 Hot lead replied: ${from}`);
      newReplies++;
    } else if (negative) {
      if (rowIndex >= 0) {
        coldSheet.getRange(rowIndex + 1, 5).setValue('unsubscribed');
      }
    }
  });
  
  Logger.log(`📬 Reply check done. ${newReplies} new positive replies.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// FOLLOW-UP SEQUENCE
// ═════════════════════════════════════════════════════════════════════════════

function sendFollowUps() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.COLD_SHEET);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  let sent = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[4];
    const dateSent = row[5];
    
    if (status === 'sent' && dateSent) {
      const daysSince = daysBetween(new Date(dateSent), today);
      const email = row[0];
      const company = row[1] || 'your company';
      const firstName = row[2] || 'there';
      
      if (daysSince === 4) {
        GmailApp.sendEmail(email, `Re: ${firstName}, quick question about your Stripe`,
          `Hi ${firstName},
          
Just following up on my email. The audit takes 2 minutes — connect Stripe read-only, I handle the rest.

I've yet to scan a Stripe account and find zero issues. Most find $500-$5,000/mo in leakage.

Worth 30 seconds? ${CONFIG.AUDIT_LINK}

Best,
${CONFIG.YOUR_NAME}`, { name: CONFIG.YOUR_NAME });
        
        sheet.getRange(i + 1, 7).setValue('Follow-up 1 sent');
        sent++;
        Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
      }
      
      if (daysSince === 7) {
        GmailApp.sendEmail(email, `Re: Your Stripe audit report`,
          `Hi ${firstName},
          
Last email from me. The free audit link stays open: ${CONFIG.AUDIT_LINK}

No hard feelings either way.

Best,
${CONFIG.YOUR_NAME}`, { name: CONFIG.YOUR_NAME });
        
        sheet.getRange(i + 1, 5).setValue('followed-up');
        sent++;
        Utilities.sleep(CONFIG.EMAIL_DELAY_MS);
      }
    }
  }
  
  Logger.log(`📧 Sent ${sent} follow-up emails.`);
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

function sendNotification(message) {
  if (CONFIG.DISCORD_WEBHOOK) {
    try {
      UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ content: message, username: 'Stripe Auditor Bot' })
      });
    } catch(e) {
      Logger.log('Discord notify failed: ' + e.message);
    }
  }
  
  if (CONFIG.TELEGRAM_BOT_TOKEN && CONFIG.TELEGRAM_CHAT_ID) {
    try {
      UrlFetchApp.fetch(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: message })
        }
      );
    } catch(e) {
      Logger.log('Telegram notify failed: ' + e.message);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGERS
// ═════════════════════════════════════════════════════════════════════════════

function setupTriggers() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => ScriptApp.deleteTrigger(t));
  
  // Reddit monitor — every 30 minutes
  ScriptApp.newTrigger('monitorReddit')
    .timeBased()
    .everyMinutes(30)
    .create();
  
  // Reply checker — every 30 minutes
  ScriptApp.newTrigger('checkReplies')
    .timeBased()
    .everyMinutes(30)
    .create();
  
  // Cold email batch — daily at 9 AM (only if you add prospects)
  ScriptApp.newTrigger('sendBatch')
    .timeBased()
    .atHour(9)
    .nearMinute(15)
    .everyDays(1)
    .create();
  
  Logger.log('✅ Triggers created: monitorReddit (30min), checkReplies (30min), sendBatch (9:15am daily)');
}

function deleteAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('🗑️ All triggers deleted.');
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY
// ═════════════════════════════════════════════════════════════════════════════

function isToday(date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

function daysBetween(d1, d2) {
  return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

function estimateLeakage(mrr) {
  const num = parseInt(String(mrr).replace(/[^0-9]/g, ''));
  if (isNaN(num)) return '$X';
  const low = Math.round(num * 0.03);
  const high = Math.round(num * 0.10);
  return '$' + low.toLocaleString() + '-' + high.toLocaleString();
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═════════════════════════════════════════════════════════════════════════════

function testReddit() {
  Logger.log('🧪 Testing Reddit monitor...');
  const count = monitorReddit();
  Logger.log(`🧪 Test complete. Found ${count} new leads.`);
}

function stats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const socialSheet = ss.getSheetByName(CONFIG.SOCIAL_SHEET);
  const socialData = socialSheet ? socialSheet.getDataRange().getValues() : [];
  const newLeads = socialData.filter((r, i) => i > 0 && r[7] === 'new').length;
  const contacted = socialData.filter((r, i) => i > 0 && r[7] === 'contacted').length;
  
  const coldSheet = ss.getSheetByName(CONFIG.COLD_SHEET);
  const coldData = coldSheet ? coldSheet.getDataRange().getValues() : [];
  const sent = coldData.filter((r, i) => i > 0 && r[4] === 'sent').length;
  const replied = coldData.filter((r, i) => i > 0 && r[4] === 'replied').length;
  
  const msg = `📊 Stats:
  Social Leads — New: ${newLeads}, Contacted: ${contacted}, Total: ${socialData.length - 1}
  Cold Email  — Sent: ${sent}, Replied: ${replied}, Total: ${coldData.length - 1}`;
  
  Logger.log(msg);
  return { social: { newLeads, contacted, total: socialData.length - 1 },
           cold: { sent, replied, total: coldData.length - 1 } };
}
