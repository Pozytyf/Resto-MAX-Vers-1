import type { Request, Response } from 'express';
import { extractToken, setAuthCookie } from '../auth.ts';
import { authService } from '../services/authService.ts';
import { handleControllerError } from '../services/errors.ts';

export function resolveSafeBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  const rawHost = String(req.get('x-forwarded-host') || req.get('host') || '').trim();
  const safeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost)
    ? rawHost
    : 'localhost:3000';
  const proto =
    req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
  return `${proto}://${safeHost}`;
}

export const authController = {
  login(req: Request, res: Response) {
    try {
      const userAgent = String(req.headers['user-agent'] || '');
      const result = authService.login(req.body || {}, userAgent);

      setAuthCookie(req, res, result.token);

      res.json(result);
    } catch (err) {
      handleControllerError(res, err, 'Erreur lors de la connexion.');
    }
  },

  async registerRestaurant(req: Request, res: Response) {
    try {
      const userAgent = String(req.headers['user-agent'] || '');
      const baseUrl = resolveSafeBaseUrl(req);
      const result = await authService.registerRestaurant(
        req.body || {},
        userAgent,
        baseUrl,
      );

      setAuthCookie(req, res, result.token);

      res.status(201).json(result);
    } catch (err) {
      handleControllerError(
        res,
        err,
        'Erreur lors de la création du restaurant.',
      );
    }
  },

  me(req: Request, res: Response) {
    try {
      const token = extractToken(req);
      const user = authService.getMe(token);
      res.json({ user });
    } catch (err) {
      handleControllerError(res, err, 'Erreur vérification session.');
    }
  },

  logout(req: Request, res: Response) {
    try {
      authService.logout(req.auth);
      res.clearCookie('restomax_token', { path: '/' });
      res.json({ ok: true });
    } catch (err) {
      handleControllerError(res, err, 'Erreur déconnexion.');
    }
  },

  changePassword(req: Request, res: Response) {
    try {
      authService.changePassword(req.auth!, req.body || {});
      res.json({ ok: true });
    } catch (err) {
      handleControllerError(res, err, 'Erreur changement de mot de passe.');
    }
  },

  async forgotPassword(req: Request, res: Response) {
    try {
      const baseUrl = resolveSafeBaseUrl(req);
      const result = await authService.forgotPassword(req.body || {}, baseUrl);
      res.json(result);
    } catch (err) {
      handleControllerError(
        res,
        err,
        'Erreur lors de la demande de réinitialisation.',
      );
    }
  },

  validateResetToken(req: Request, res: Response) {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const result = authService.validateResetToken(token);
      res.json(result);
    } catch (err) {
      handleControllerError(
        res,
        err,
        'Erreur lors de la vérification du jeton.',
      );
    }
  },

  resetPassword(req: Request, res: Response) {
    try {
      authService.resetPassword(req.body || {});
      res.json({ ok: true });
    } catch (err) {
      handleControllerError(
        res,
        err,
        'Erreur lors de la réinitialisation du mot de passe.',
      );
    }
  },

  async sendVerification(req: Request, res: Response) {
    try {
      const baseUrl = resolveSafeBaseUrl(req);
      const result = await authService.sendVerificationEmail(
        req.auth!,
        baseUrl,
      );
      res.json(result);
    } catch (err) {
      handleControllerError(
        res,
        err,
        'Erreur envoi lien de vérification e-mail.',
      );
    }
  },

  verifyEmail(req: Request, res: Response) {
    try {
      const result = authService.verifyEmail(req.body || {});
      res.json(result);
    } catch (err) {
      handleControllerError(res, err, 'Erreur vérification e-mail.');
    }
  },

  setPin(req: Request, res: Response) {
    try {
      authService.setPin(req.auth!, req.body || {});
      res.json({ ok: true });
    } catch (err) {
      handleControllerError(res, err, 'Erreur configuration code PIN.');
    }
  },

  pinLogin(req: Request, res: Response) {
    try {
      const userAgent = String(req.headers['user-agent'] || '');
      const result = authService.pinLogin(
        req.body || {},
        userAgent,
        req.auth?.restaurantId || null,
      );

      setAuthCookie(req, res, result.token);

      res.json(result);
    } catch (err) {
      handleControllerError(res, err, 'Erreur connexion par code PIN.');
    }
  },

  getVenues(req: Request, res: Response) {
    try {
      const venues = authService.getUserVenues(req.auth!);
      res.json({ venues });
    } catch (err) {
      handleControllerError(res, err, 'Erreur chargement établissements.');
    }
  },

  switchVenue(req: Request, res: Response) {
    try {
      const result = authService.switchVenue(
        req.auth!,
        String(req.body?.restaurantId || ''),
      );
      res.json(result);
    } catch (err) {
      handleControllerError(res, err, 'Erreur changement d’établissement.');
    }
  },
};
