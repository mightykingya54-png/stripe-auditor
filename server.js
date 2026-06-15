import express from 'express';
import { setupAuditRoutes } from './src/audit/routes.js';

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'running' }));

// Root — redirect to audit
app.get('/', (req, res) => res.redirect('/audit'));

// Mount Stripe Auditor
setupAuditRoutes(app, {});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔍 Stripe Auditor running on http://0.0.0.0:${PORT}`);
  console.log(`   Landing: /audit`);
});
