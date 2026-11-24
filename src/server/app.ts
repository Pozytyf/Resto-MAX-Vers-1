import express from 'express';
import cookieParser from 'cookie-parser';
import { publicRouter } from './routes/public.ts';
import { authRouter } from './routes/auth.ts';
import { restaurantRouter } from './routes/restaurant.ts';
import { superAdminRouter } from './routes/superadmin.ts';
import { checkSupabaseHealth } from './lib/supabase.ts';
import { getWebSocketStats } from './ws.ts';

export function createExpressApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const mutating =
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH' ||
      req.method === 'DELETE';
    const hasCookieAuth = Boolean(req.cookies?.restomax_token);
    const hasBearer =
      typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ');
    if (mutating && hasCookieAuth && !hasBearer) {
      const origin = req.get('origin');
      const host = req.get('x-forwarded-host') || req.get('host');
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            res.status(403).json({ error: 'Origine de requête non autorisée.' });
            return;
          }
        } catch {
          res.status(403).json({ error: 'Origine invalide.' });
          return;
        }
      }
    }
    next();
  });

  // Healthcheck (single, multi-instance & Supabase/Vercel readiness)
  app.get('/api/health', async (_req, res) => {
    const dbClient = (process.env.DATABASE_CLIENT || 'sqlite').toLowerCase();
    const wsStats = getWebSocketStats();
    const supabaseHealth = await checkSupabaseHealth();
    res.json({
      status: 'ok',
      service: 'restomax',
      timezone: 'Africa/Abidjan',
      dbClient,
      instanceId: wsStats.instanceId,
      pubsubMode: wsStats.pubsubMode,
      connectedWsClients: wsStats.connectedClients,
      supabaseConfigured: supabaseHealth.configured,
      supabaseRealtimeReady: supabaseHealth.realtimeReady,
      postgresConnected: supabaseHealth.postgresConnected,
      postgresLatencyMs: supabaseHealth.latencyMs,
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelRegion: process.env.VERCEL_REGION || null,
    });
  });

  // SEO endpoints: robots.txt & dynamic sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl =
      process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /app',
        'Disallow: /superadmin',
        'Disallow: /api',
        `Sitemap: ${baseUrl}/sitemap.xml`,
      ].join('\n'),
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl =
      process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const urls = [
      '/',
      '/fonctionnalites',
      '/tarifs',
      '/demonstration',
      '/a-propos',
      '/contact',
      '/faq',
      '/mentions-legales',
      '/confidentialite',
      '/cgu',
      '/cgv',
      '/cookies',
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${baseUrl}${u}</loc>
    <changefreq>weekly</changefreq>
  </url>`,
  )
  .join('\n')}
</urlset>`;
    res.type('application/xml').send(xml);
  });

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/restaurant', restaurantRouter);
  app.use('/api/superadmin', superAdminRouter);

  return app;
}
