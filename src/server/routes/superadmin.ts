import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../auth.ts';
import { superadminController } from '../controllers/superadminController.ts';

export const superAdminRouter = Router();

superAdminRouter.use(requireAuth, requireSuperAdmin);

// 1. PLATFORM SUPER-ADMIN DASHBOARD
superAdminRouter.get('/dashboard', superadminController.getDashboard);

// 2. RESTAURANTS MANAGEMENT
superAdminRouter.get('/restaurants', superadminController.listRestaurants);
superAdminRouter.get('/restaurants/:id', superadminController.getRestaurantDetail);
superAdminRouter.post('/restaurants', superadminController.createRestaurant);
superAdminRouter.patch('/restaurants/:id', superadminController.updateRestaurant);
superAdminRouter.patch(
  '/restaurants/:id/status',
  superadminController.updateRestaurantStatus,
);

// 3. PLANS & SUBSCRIPTIONS
superAdminRouter.get('/plans', superadminController.listPlans);
superAdminRouter.post('/plans', superadminController.createPlan);
superAdminRouter.patch('/plans/:id', superadminController.updatePlan);
superAdminRouter.get('/subscriptions', superadminController.listSubscriptions);
superAdminRouter.patch(
  '/subscriptions/:id',
  superadminController.updateSubscription,
);

// 4. PLATFORM BILLING (Circuit A)
superAdminRouter.get('/billing', superadminController.listInvoices);
superAdminRouter.post('/billing', superadminController.createManualInvoice);
superAdminRouter.post(
  '/billing/:id/mark-paid',
  superadminController.markInvoicePaid,
);
superAdminRouter.patch(
  '/billing/:id/status',
  superadminController.updateInvoiceStatus,
);

// 5. USERS & SESSION REVOCATION
superAdminRouter.get('/users', superadminController.listUsers);
superAdminRouter.post('/users/superadmin', superadminController.createSuperAdmin);
superAdminRouter.patch('/users/:id/status', superadminController.updateUserStatus);
superAdminRouter.post(
  '/users/:id/revoke-sessions',
  superadminController.revokeUserSessions,
);
superAdminRouter.post(
  '/users/:id/verify-email',
  superadminController.verifyUserEmail,
);
superAdminRouter.post(
  '/users/:id/reset-password',
  superadminController.triggerUserPasswordReset,
);

// 6. SUPPORT TICKETS & LEADS
superAdminRouter.get('/tickets', superadminController.listTickets);
superAdminRouter.post('/tickets', superadminController.createTicket);
superAdminRouter.post(
  '/tickets/:id/reply',
  superadminController.replyToTicket,
);
superAdminRouter.patch('/leads/:id', superadminController.updateLead);
superAdminRouter.post('/leads/:id/convert', superadminController.convertLead);

// 7. AUDIT LOGS & PLATFORM SETTINGS
superAdminRouter.get('/audit', superadminController.listAuditLogs);
superAdminRouter.get('/settings', superadminController.getSettings);
superAdminRouter.patch('/settings', superadminController.updateSettings);
superAdminRouter.post('/settings/test-smtp', superadminController.testSmtp);
