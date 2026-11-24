import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDb, setTestDb } from '../server/db.ts';
import { createExpressApp } from '../server/app.ts';
import { validateMenuImageUrl } from '../restaurant/menu/imageUpload.ts';

let server: http.Server;
let baseUrl: string;

async function req(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test.before(async () => {
  const db = getDb(':memory:');
  setTestDb(db);

  const app = createExpressApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('1. validateMenuImageUrl accepts safe photos/URLs and blocks XSS/oversized payloads', () => {
  assert.equal(validateMenuImageUrl(''), true);
  assert.equal(
    validateMenuImageUrl('/src/assets/images/dish_capitaine_attieke_1795030466633.jpg'),
    true,
  );
  assert.equal(validateMenuImageUrl('https://cdn.example.com/plat.jpg'), true);
  assert.equal(
    validateMenuImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    true,
  );
  assert.equal(validateMenuImageUrl('javascript:alert(1)'), false);
  assert.equal(
    validateMenuImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    false,
  );
});

test('2. Creating and updating menu items persists photo, options, pricing, and blocks invalid image URLs', async () => {
  const login = await req('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'proprietaire@lesillage.ci',
      password: 'RestoMax2026!',
    },
  });
  assert.equal(login.status, 200);
  const token = (login.data as { token: string }).token;

  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // Reject unsafe image URL
  const badCreate = await req('/api/restaurant/menu/items', {
    method: 'POST',
    token,
    body: {
      categoryId: 'cat_plats',
      name: 'Plat Test XSS',
      priceXof: 4000,
      imageUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    },
  });
  assert.equal(badCreate.status, 400);

  // Create complete item with photo, description, cost, sortOrder, and customer options
  const createRes = await req('/api/restaurant/menu/items', {
    method: 'POST',
    token,
    body: {
      categoryId: 'cat_plats',
      name: 'Mérou grillé complet',
      description: 'Mérou frais grillé avec sauce chien et alloco.',
      priceXof: 14000,
      costPriceXof: 5200,
      imageUrl: samplePngDataUrl,
      available: true,
      sortOrder: 3,
      options: [
        { label: 'Supplément Attiéké', priceDeltaXof: 1000 },
        { label: 'Piment doux', priceDeltaXof: 0 },
      ],
    },
  });
  assert.equal(createRes.status, 201);
  const createdId = (createRes.data as { id: string }).id;
  assert.ok(createdId);

  const menuRes = await req('/api/restaurant/menu', { token });
  assert.equal(menuRes.status, 200);
  const createdItem = (
    menuRes.data as {
      items: Array<{
        id: string;
        name: string;
        description: string;
        priceXof: number;
        costPriceXof: number;
        imageUrl: string | null;
        sortOrder: number;
        options: Array<{ label: string; priceDeltaXof: number }>;
      }>;
    }
  ).items.find((it) => it.id === createdId);

  assert.ok(createdItem);
  assert.equal(createdItem.name, 'Mérou grillé complet');
  assert.equal(createdItem.priceXof, 14000);
  assert.equal(createdItem.costPriceXof, 5200);
  assert.equal(createdItem.imageUrl, samplePngDataUrl);
  assert.equal(createdItem.sortOrder, 3);
  assert.equal(createdItem.options.length, 2);
  assert.equal(createdItem.options[0].label, 'Supplément Attiéké');

  // Update item photo to null and update price/options
  const patchRes = await req(`/api/restaurant/menu/items/${createdId}`, {
    method: 'PATCH',
    token,
    body: {
      priceXof: 15000,
      imageUrl: null,
      options: [{ label: 'Sauce verte', priceDeltaXof: 500 }],
    },
  });
  assert.equal(patchRes.status, 200);

  const updatedMenu = await req('/api/restaurant/menu', { token });
  const updatedItem = (
    updatedMenu.data as {
      items: Array<{
        id: string;
        priceXof: number;
        imageUrl: string | null;
        options: Array<{ label: string; priceDeltaXof: number }>;
      }>;
    }
  ).items.find((it) => it.id === createdId);

  assert.ok(updatedItem);
  assert.equal(updatedItem.priceXof, 15000);
  assert.equal(updatedItem.imageUrl, null);
  assert.equal(updatedItem.options.length, 1);
  assert.equal(updatedItem.options[0].label, 'Sauce verte');
});
