const fetch = require('node-fetch');

async function test() {
  const urlParams = new URLSearchParams({ slug: 'palmyra' });
  const menuRes = await fetch('https://palmy-production-2021.up.railway.app/api/menu/categories?' + urlParams);
  const menu = await menuRes.json();
  const product = menu[0].products[0];
  console.log("Mock product ID:", product.id);

  const orderPayload = {
    type: "DELIVERY",
    customerName: "Test Name",
    customerPhone: "+46728357970",
    deliveryStreet: "Stora testgatan 2",
    deliveryZip: "12345",
    restaurantSlug: "palmyra",
    discountCode: "test",
    stripePaymentIntentId: "FREE_PROMO",
    items: [
      {
        productId: product.id,
        quantity: 1,
        selectedExtras: [],
        note: null
      }
    ]
  };

  const orderRes = await fetch('https://palmy-production-2021.up.railway.app/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload)
  });

  const orderData = await orderRes.json();
  console.log("Order response:", JSON.stringify(orderData, null, 2));
}

test().catch(console.error);
