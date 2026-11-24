import { Router } from 'express';
import { publicController } from '../controllers/publicController.ts';

export const publicRouter = Router();

publicRouter.get('/plans', publicController.getPlans);
publicRouter.get('/settings', publicController.getSettings);
publicRouter.post('/contact', publicController.submitContact);
publicRouter.post('/demo-requests', publicController.submitDemoRequest);

// QR Table endpoints
publicRouter.get('/qr-image/:token', publicController.getQrImage);
publicRouter.get('/qr/:token', publicController.getQrMenuContext);
publicRouter.get('/qr/:token/loyalty', publicController.lookupQrLoyalty);
publicRouter.post('/qr/:token/call', publicController.callWaiterOrBill);
publicRouter.post('/qr/:token/orders', publicController.submitQrOrder);
publicRouter.get('/qr/:token/orders/:orderId', publicController.trackQrOrder);
publicRouter.post('/qr/:token/orders/:orderId/pay', publicController.payQrOrder);
publicRouter.post('/qr/:token/orders/:orderId/review', publicController.submitQrReview);
publicRouter.post('/qr/:token/service-rating', publicController.submitQrServiceRating);

// Storefront (Click & Collect & Delivery) endpoints
publicRouter.get('/store/:slug', publicController.getStorefrontContext);
publicRouter.get('/store/:slug/loyalty', publicController.lookupStorefrontLoyalty);
publicRouter.post('/store/:slug/orders', publicController.submitStorefrontOrder);
publicRouter.get('/store/:slug/orders/:orderId', publicController.trackStorefrontOrder);
publicRouter.post('/store/:slug/orders/:orderId/pay', publicController.payStorefrontOrder);
publicRouter.post('/store/:slug/orders/:orderId/review', publicController.submitStorefrontReview);
publicRouter.post('/store/:slug/service-rating', publicController.submitStorefrontServiceRating);

publicRouter.post('/webhooks/paydunya', publicController.handlePaydunyaWebhook);
