const escapeXml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).send('Method not allowed');
    return;
  }

  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || (host?.startsWith('localhost') ? 'http' : 'https');
  const configuredOrigin = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
  const origin = configuredOrigin || `${protocol}://${host}`;
  const pages = ['/', '/golden-crunch.html', '/beef-delight.html'];
  const urls = pages
    .map((page) => `  <url><loc>${escapeXml(`${origin}${page}`)}</loc></url>`)
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(sitemap);
};
