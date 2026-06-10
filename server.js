const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4242);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const ROOT_DIR = __dirname;

const allowedPriceIds = new Set([
  'price_1TeQI0HzqKH9HNrFgZCCDn9i',
  'price_1TeQO2HzqKH9HNrFMUZvzdcr',
  'price_1TeQGbHzqKH9HNrFGi6LwfW6',
  'price_1TeQGbHzqKH9HNrFhn2V78e1'
]);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
};

const sendSitemap = (req, res) => {
  const origin = PUBLIC_BASE_URL.replace(/\/+$/, '');
  const pages = ['/', '/golden-crunch.html', '/beef-delight.html'];
  const urls = pages
    .map((page) => `  <url><loc>${origin}${page}</loc></url>`)
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
  res.end(sitemap);
};

const sendRobots = (req, res) => {
  const origin = PUBLIC_BASE_URL.replace(/\/+$/, '');
  const robots = `User-agent: *
Allow: /
Sitemap: ${origin}/sitemap.xml
`;

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
  res.end(robots);
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk;

    if (body.length > 1_000_000) {
      req.destroy();
      reject(new Error('Request body is too large'));
    }
  });

  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const createCheckoutSession = async (lineItems) => {
  const form = new URLSearchParams();

  form.set('mode', 'payment');
  form.set('success_url', `${PUBLIC_BASE_URL}/thank-you.html`);
  form.set('cancel_url', `${PUBLIC_BASE_URL}/?checkout=cancel#our-product`);
  form.set('billing_address_collection', 'required');
  form.set('phone_number_collection[enabled]', 'true');
  form.set('shipping_address_collection[allowed_countries][]', 'US');

  lineItems.forEach((item, index) => {
    form.set(`line_items[${index}][price]`, item.price);
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });

  const session = await response.json();

  if (!response.ok) {
    throw new Error(session.error?.message || 'Stripe checkout session failed');
  }

  return session;
};

const handleCheckout = async (req, res) => {
  if (!STRIPE_SECRET_KEY) {
    sendJson(res, 500, {
      error: 'Missing STRIPE_SECRET_KEY. Set it before running node server.js.'
    });
    return;
  }

  try {
    const body = await readRequestBody(req);
    const { lineItems } = JSON.parse(body || '{}');

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      sendJson(res, 400, { error: 'Cart is empty.' });
      return;
    }

    const cleanLineItems = lineItems.map((item) => ({
      price: String(item.price || ''),
      quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1)
    }));

    const hasInvalidPrice = cleanLineItems.some((item) => !allowedPriceIds.has(item.price));

    if (hasInvalidPrice) {
      sendJson(res, 400, { error: 'Invalid Stripe price ID.' });
      return;
    }

    const session = await createCheckoutSession(cleanLineItems);
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Checkout failed.' });
  }
};

const serveStaticFile = (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, PUBLIC_BASE_URL).pathname);
  const filePath = requestPath === '/'
    ? path.join(ROOT_DIR, 'index.html')
    : path.join(ROOT_DIR, requestPath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream'
    });
    res.end(content);
  });
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/create-checkout-session') {
    handleCheckout(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/sitemap.xml') {
    sendSitemap(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/robots.txt') {
    sendRobots(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStaticFile(req, res);
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Pawlio server running at http://localhost:${PORT}`);
});
