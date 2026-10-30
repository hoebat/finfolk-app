// Stripe Checkout uses only server-configured prices and shipping rates.
export async function createShopCheckout(input, env, fetcher = fetch) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_SHIPPING_RATE_ID || !env.STRIPE_ALLOWED_PRICE_IDS)
    return { status: 503, body: { error: 'The shop is not open yet.' } };
  const allowed = new Set(env.STRIPE_ALLOWED_PRICE_IDS.split(',').map(s => s.trim()).filter(Boolean));
  const items = input?.items;
  if (!Array.isArray(items) || !items.length || items.length > 20)
    return { status: 400, body: { error: 'Choose between 1 and 20 items.' } };
  const unique = new Set();
  for (const item of items) {
    if (!item || typeof item.priceId !== 'string' || !allowed.has(item.priceId) || unique.has(item.priceId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
      return { status: 400, body: { error: 'Invalid cart.' } };
    unique.add(item.priceId);
  }
  const params = new URLSearchParams({mode:'payment', success_url:'https://finfolk.com.au/?view=shop&checkout=success', cancel_url:'https://finfolk.com.au/?view=shop&checkout=cancelled', 'shipping_address_collection[allowed_countries][0]':'AU', 'shipping_options[0][shipping_rate]':env.STRIPE_SHIPPING_RATE_ID});
  items.forEach((item, i) => { params.set(`line_items[${i}][price]`, item.priceId); params.set(`line_items[${i}][quantity]`, String(item.quantity)); });
  try {
    const response = await fetcher('https://api.stripe.com/v1/checkout/sessions', {method:'POST', headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type':'application/x-www-form-urlencoded'}, body:params});
    const data = await response.json();
    if (!response.ok || typeof data.url !== 'string' || new URL(data.url).origin !== 'https://checkout.stripe.com') throw Error('Checkout unavailable');
    return {status:200, body:{url:data.url}};
  } catch { return {status:502, body:{error:'Checkout is unavailable. Please try again.'}}; }
}
