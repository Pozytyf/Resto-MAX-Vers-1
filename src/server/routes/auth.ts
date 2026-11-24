import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import { authController } from '../controllers/authController.ts';

export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/register-restaurant', authController.registerRestaurant);
authRouter.post('/forgot-password', authController.forgotPassword);
authRouter.get('/reset-password/validate', authController.validateResetToken);
authRouter.post('/reset-password', authController.resetPassword);
authRouter.post('/verify-email', authController.verifyEmail);
authRouter.post('/send-verification', requireAuth, authController.sendVerification);
authRouter.get('/me', authController.me);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.post('/change-password', requireAuth, authController.changePassword);
authRouter.post('/pin', requireAuth, authController.setPin);
authRouter.post('/pin-login', requireAuth, authController.pinLogin);
authRouter.get('/venues', requireAuth, authController.getVenues);
authRouter.post('/switch-venue', requireAuth, authController.switchVenue);

