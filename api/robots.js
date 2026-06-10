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
  const robots = `User-agent: *
Allow: /
Sitemap: ${origin}/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(robots);
};
