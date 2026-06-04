const allowedPriceIds = new Set([
  'price_1TeQI0HzqKH9HNrFgZCCDn9i',
  'price_1TeQO2HzqKH9HNrFMUZvzdcr',
  'price_1TeQGbHzqKH9HNrFGi6LwfW6',
  'price_1TeQGbHzqKH9HNrFhn2V78e1'
]);

const getBaseUrl = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';

  return `${protocol}://${host}`;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY.' });
    return;
  }

  try {
    const { lineItems } = req.body || {};

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }

    const cleanLineItems = lineItems.map((item) => ({
      price: String(item.price || ''),
      quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1)
    }));

    const hasInvalidPrice = cleanLineItems.some((item) => !allowedPriceIds.has(item.price));

    if (hasInvalidPrice) {
      res.status(400).json({ error: 'Invalid Stripe price ID.' });
      return;
    }

    const baseUrl = getBaseUrl(req);
    const form = new URLSearchParams();

    form.set('mode', 'payment');
    form.set('success_url', `${baseUrl}/thank-you.html`);
    form.set('cancel_url', `${baseUrl}/?checkout=cancel#our-product`);
    form.set('billing_address_collection', 'required');
    form.set('phone_number_collection[enabled]', 'true');
    form.set('shipping_address_collection[allowed_countries][]', 'MY');

    cleanLineItems.forEach((item, index) => {
      form.set(`line_items[${index}][price]`, item.price);
      form.set(`line_items[${index}][quantity]`, String(item.quantity));
    });

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      res.status(500).json({ error: session.error?.message || 'Stripe checkout session failed.' });
      return;
    }

    res.status(200).json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Checkout failed.' });
  }
};
