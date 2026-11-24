import { Router } from 'express';
import {
  requireActiveRestaurant,
  requireAuth,
  requirePermission,
} from '../auth.ts';
import { restaurantController } from '../controllers/restaurantController.ts';
import { operationsController } from '../controllers/operationsController.ts';

export const restaurantRouter = Router();

restaurantRouter.use(requireAuth, requireActiveRestaurant);

// 1. OWNER / MANAGEMENT DASHBOARD
restaurantRouter.get(
  '/dashboard',
  requirePermission('dashboard:read'),
  restaurantController.getDashboard,
);

// 2. MENU & CATALOG
restaurantRouter.get(
  '/menu',
  requirePermission('menu:read'),
  restaurantController.getMenu,
);
restaurantRouter.post(
  '/menu/categories',
  requirePermission('menu:write'),
  restaurantController.createCategory,
);
restaurantRouter.patch(
  '/menu/categories/:id',
  requirePermission('menu:write'),
  restaurantController.updateCategory,
);
restaurantRouter.delete(
  '/menu/categories/:id',
  requirePermission('menu:write'),
  restaurantController.deleteCategory,
);
restaurantRouter.post(
  '/menu/items',
  requirePermission('menu:write'),
  restaurantController.createMenuItem,
);
restaurantRouter.patch(
  '/menu/items/:id',
  requirePermission('menu:write'),
  restaurantController.updateMenuItem,
);
restaurantRouter.delete(
  '/menu/items/:id',
  requirePermission('menu:write'),
  restaurantController.deleteMenuItem,
);
restaurantRouter.get(
  '/recipes',
  requirePermission('menu:read'),
  restaurantController.getRecipes,
);
restaurantRouter.put(
  '/menu/items/:id/recipe',
  requirePermission('menu:write'),
  restaurantController.updateMenuItemRecipe,
);

// 3. ORDERS & KDS
restaurantRouter.get(
  '/orders',
  requirePermission('orders:read'),
  restaurantController.getOrders,
);
restaurantRouter.post(
  '/orders',
  requirePermission('orders:write'),
  restaurantController.createPosOrder,
);
restaurantRouter.patch(
  '/orders/:id/status',
  requirePermission('orders:read'),
  restaurantController.updateOrderStatus,
);
restaurantRouter.post(
  '/orders/:id/whatsapp-receipt',
  requirePermission('orders:read'),
  restaurantController.sendOrderWhatsappReceipt,
);

// 4. POS PAYMENTS & REFUNDS
restaurantRouter.get(
  '/payments',
  requirePermission('pos:use'),
  restaurantController.getPayments,
);
restaurantRouter.post(
  '/orders/:id/pay',
  requirePermission('pos:pay'),
  restaurantController.payOrder,
);
restaurantRouter.get(
  '/pos/operators',
  requirePermission('pos:use'),
  restaurantController.getPosPinOperators,
);
restaurantRouter.post(
  '/pos/pin-switch',
  requirePermission('pos:use'),
  restaurantController.posPinSwitch,
);
restaurantRouter.post(
  '/payments/:id/refund',
  requirePermission('pos:refund'),
  restaurantController.refundPayment,
);

// 5. TABLES & QR CODES
restaurantRouter.get(
  '/tables',
  requirePermission('floor:read'),
  restaurantController.getTables,
);
restaurantRouter.post(
  '/tables',
  requirePermission('floor:write'),
  restaurantController.createTable,
);
restaurantRouter.patch(
  '/tables/:id',
  requirePermission('floor:write'),
  restaurantController.updateTable,
);
restaurantRouter.delete(
  '/tables/:id',
  requirePermission('floor:write'),
  restaurantController.deleteTable,
);
restaurantRouter.post(
  '/tables/:id/transfer',
  requirePermission('floor:write'),
  restaurantController.transferTable,
);
restaurantRouter.post(
  '/tables/:id/merge',
  requirePermission('floor:write'),
  restaurantController.mergeTables,
);
restaurantRouter.patch(
  '/tables/:id/status',
  requirePermission('floor:write'),
  restaurantController.updateTableStatus,
);
restaurantRouter.post(
  '/tables/:id/qr-regenerate',
  requirePermission('qr:manage'),
  restaurantController.regenerateTableQr,
);

// 6. STOCKS, PURCHASE ORDERS & AUTOMATED ALERTS
restaurantRouter.get(
  '/stocks',
  requirePermission('stocks:read'),
  restaurantController.getStocks,
);
restaurantRouter.post(
  '/stocks',
  requirePermission('stocks:write'),
  restaurantController.createStockItem,
);
restaurantRouter.patch(
  '/stocks/:id',
  requirePermission('stocks:write'),
  restaurantController.updateStockItem,
);
restaurantRouter.delete(
  '/stocks/:id',
  requirePermission('stocks:write'),
  restaurantController.deleteStockItem,
);
restaurantRouter.post(
  '/stocks/:id/move',
  requirePermission('stocks:write'),
  restaurantController.moveStock,
);
restaurantRouter.get(
  '/purchase-orders',
  requirePermission('stocks:read'),
  restaurantController.getPurchaseOrders,
);
restaurantRouter.post(
  '/purchase-orders',
  requirePermission('stocks:write'),
  restaurantController.createPurchaseOrder,
);
restaurantRouter.patch(
  '/purchase-orders/:id/status',
  requirePermission('stocks:write'),
  restaurantController.updatePurchaseOrderStatus,
);
restaurantRouter.get(
  '/stocks/alerts/config',
  requirePermission('stocks:read'),
  restaurantController.getStockAlertConfig,
);
restaurantRouter.patch(
  '/stocks/alerts/config',
  requirePermission('stocks:write'),
  restaurantController.updateStockAlertConfig,
);
restaurantRouter.post(
  '/stocks/:id/alert-test',
  requirePermission('stocks:write'),
  restaurantController.triggerManualStockAlert,
);
restaurantRouter.post(
  '/stocks/alerts/test-email',
  requirePermission('stocks:write'),
  restaurantController.testStockAlertEmail,
);

// IN-APP NOTIFICATIONS
restaurantRouter.get(
  '/notifications',
  restaurantController.getNotifications,
);
restaurantRouter.patch(
  '/notifications/read',
  restaurantController.markNotificationsRead,
);

// 7. STAFF, PIN DIRECTORY & GRANULAR PERMISSIONS
restaurantRouter.get(
  '/staff/pin-directory',
  restaurantController.getPinDirectory,
);
restaurantRouter.get(
  '/staff',
  requirePermission('staff:read'),
  restaurantController.getStaff,
);
restaurantRouter.post(
  '/staff',
  requirePermission('staff:manage'),
  restaurantController.createStaff,
);
restaurantRouter.patch(
  '/staff/:memberId',
  requirePermission('staff:manage'),
  restaurantController.updateStaff,
);
restaurantRouter.delete(
  '/staff/:memberId',
  requirePermission('staff:manage'),
  restaurantController.deleteStaff,
);

// 8. CUSTOMERS & RESERVATIONS
restaurantRouter.get(
  '/customers',
  requirePermission('customers:read'),
  restaurantController.getCustomers,
);
restaurantRouter.post(
  '/customers',
  requirePermission('customers:write'),
  restaurantController.createCustomer,
);
restaurantRouter.patch(
  '/customers/:id',
  requirePermission('customers:write'),
  restaurantController.updateCustomer,
);
restaurantRouter.delete(
  '/customers/:id',
  requirePermission('customers:write'),
  restaurantController.deleteCustomer,
);
restaurantRouter.get(
  '/reservations',
  requirePermission('reservations:read'),
  restaurantController.getReservations,
);
restaurantRouter.post(
  '/reservations',
  requirePermission('reservations:write'),
  restaurantController.createReservation,
);
restaurantRouter.patch(
  '/reservations/:id/status',
  requirePermission('reservations:write'),
  restaurantController.updateReservationStatus,
);
restaurantRouter.post(
  '/reservations/:id/whatsapp',
  requirePermission('reservations:write'),
  restaurantController.sendReservationWhatsapp,
);

// 9. FINANCE, EXPENSES, REPORTS & CSV EXPORT
restaurantRouter.get(
  '/finance',
  requirePermission('finance:read'),
  restaurantController.getFinance,
);
restaurantRouter.post(
  '/expenses',
  requirePermission('finance:read'),
  restaurantController.createExpense,
);
restaurantRouter.patch(
  '/expenses/:id',
  requirePermission('finance:read'),
  restaurantController.updateExpense,
);
restaurantRouter.delete(
  '/expenses/:id',
  requirePermission('finance:read'),
  restaurantController.deleteExpense,
);
restaurantRouter.get(
  '/reports/export',
  requirePermission('reports:read'),
  restaurantController.exportOrdersCsv,
);

// 10. SETTINGS, SAAS SUBSCRIPTION PORTAL, WHATSAPP & SUPPORT TICKETS
restaurantRouter.get(
  '/settings',
  requirePermission('settings:read'),
  restaurantController.getSettings,
);
restaurantRouter.patch(
  '/settings',
  requirePermission('settings:write'),
  restaurantController.updateSettings,
);
restaurantRouter.get(
  '/subscription',
  requirePermission('settings:read'),
  restaurantController.getSubscriptionPortal,
);
restaurantRouter.post(
  '/subscription/checkout',
  requirePermission('settings:write'),
  restaurantController.checkoutSubscription,
);
restaurantRouter.post(
  '/subscription/verify',
  requirePermission('settings:write'),
  restaurantController.verifySubscription,
);
restaurantRouter.patch(
  '/subscription/auto-renew',
  requirePermission('settings:write'),
  restaurantController.updateAutoRenew,
);
restaurantRouter.post(
  '/subscription/renew-now',
  requirePermission('settings:write'),
  restaurantController.renewSubscription,
);
restaurantRouter.get(
  '/whatsapp/logs',
  requirePermission('settings:read'),
  restaurantController.getWhatsappLogs,
);
restaurantRouter.post(
  '/print/escpos',
  requirePermission('pos:use'),
  restaurantController.printEscposTicket,
);
restaurantRouter.get(
  '/tickets',
  requirePermission('settings:read'),
  restaurantController.getTickets,
);
restaurantRouter.post(
  '/tickets',
  requirePermission('settings:read'),
  restaurantController.createTicket,
);

// 11. COMBOS, HAPPY HOUR & PROMO CODES
restaurantRouter.get('/combos', requirePermission('menu:read'), operationsController.listCombos);
restaurantRouter.post('/combos', requirePermission('menu:write'), operationsController.createCombo);
restaurantRouter.patch('/combos/:id', requirePermission('menu:write'), operationsController.updateCombo);
restaurantRouter.delete('/combos/:id', requirePermission('menu:write'), operationsController.deleteCombo);

restaurantRouter.get('/promotions', requirePermission('menu:read'), operationsController.listPromotions);
restaurantRouter.post('/promotions', requirePermission('menu:write'), operationsController.createPromotion);
restaurantRouter.patch('/promotions/:id', requirePermission('menu:write'), operationsController.updatePromotion);
restaurantRouter.delete('/promotions/:id', requirePermission('menu:write'), operationsController.deletePromotion);

// 12. CASH REGISTER & Z-REPORTS
restaurantRouter.get('/pos/register', requirePermission('pos:use'), operationsController.getRegisterState);
restaurantRouter.post('/pos/register/open', requirePermission('pos:pay'), operationsController.openRegister);
restaurantRouter.post('/pos/register/close', requirePermission('pos:pay'), operationsController.closeRegister);

// 13. TABLE CALLS (WAITER / BILL)
restaurantRouter.get('/table-calls', requirePermission('orders:read'), operationsController.listTableCalls);
restaurantRouter.post('/table-calls/:id/ack', requirePermission('orders:read'), operationsController.acknowledgeTableCall);

// 14. LOYALTY & CUSTOMER REVIEWS
restaurantRouter.get('/customers/:id/loyalty', requirePermission('customers:read'), operationsController.getCustomerLoyalty);
restaurantRouter.post('/customers/:id/loyalty/adjust', requirePermission('customers:write'), operationsController.adjustCustomerLoyalty);
restaurantRouter.get('/reviews', requirePermission('customers:read'), operationsController.listReviews);
restaurantRouter.post('/reviews/:id/reply', requirePermission('customers:write'), operationsController.replyReview);

// 15. INVENTORY COUNTS & TYPED WASTE
restaurantRouter.get('/inventory-counts', requirePermission('stocks:read'), operationsController.listInventoryCounts);
restaurantRouter.post('/inventory-counts', requirePermission('stocks:write'), operationsController.createInventoryCount);
restaurantRouter.post('/stocks/:id/waste', requirePermission('stocks:write'), operationsController.recordWaste);

// 16. STAFF SHIFTS & PIN TIME CLOCK
restaurantRouter.get('/shifts', requirePermission('staff:read'), operationsController.listShiftsAndClocks);
restaurantRouter.post('/shifts', requirePermission('staff:manage'), operationsController.createShift);
restaurantRouter.delete('/shifts/:id', requirePermission('staff:manage'), operationsController.deleteShift);
restaurantRouter.post('/shifts/clock', requirePermission('pos:use'), operationsController.clockWithPin);

// 17. B2B PROFORMA & INVOICES
restaurantRouter.get('/b2b-invoices', requirePermission('finance:read'), operationsController.listB2bInvoices);
restaurantRouter.post('/b2b-invoices', requirePermission('finance:read'), operationsController.createB2bInvoice);
restaurantRouter.patch('/b2b-invoices/:id/status', requirePermission('finance:read'), operationsController.updateB2bStatus);
restaurantRouter.post('/b2b-invoices/:id/convert', requirePermission('finance:read'), operationsController.convertProforma);

// 18. MULTI-VENUE BRANCHES & CONSOLIDATED VIEW
restaurantRouter.post('/venues', requirePermission('settings:write'), operationsController.createBranchVenue);
restaurantRouter.get('/venues/consolidated', requirePermission('dashboard:read'), operationsController.getConsolidatedOverview);

