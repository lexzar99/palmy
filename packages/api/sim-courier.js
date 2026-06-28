// Dev helper: simulate a courier broadcasting GPS for an order so the customer
// tracking page shows the live courier dot moving. LOCAL DEV ONLY.
//   node packages/api/sim-courier.js <orderId> [steps] [intervalMs]
require('dotenv').config({ path: __dirname + '/.env' });
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const ORDER_ID = process.argv[2] || 'cmqrp1ilk0008gf67cni6hm4b';
const STEPS = Number(process.argv[3] || 10);
const INTERVAL = Number(process.argv[4] || 1500);
// Hur långt längs rutten budet ska köra (0..1). 0.45 = stanna mitt på vägen.
const MAX_FRAC = Number(process.argv[5] || 1);
const API = process.env.SIM_API || 'http://localhost:4000';
const JWT_SECRET = process.env.JWT_SECRET;

const p = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const order = await p.order.findUnique({
    where: { id: ORDER_ID },
    select: {
      orderNumber: true, deliveryLatitude: true, deliveryLongitude: true,
      restaurant: { select: { latitude: true, longitude: true } },
      delivery: { select: { courierId: true, status: true } },
    },
  });
  if (!order) throw new Error('order not found');
  const courierId = order.delivery?.courierId;
  if (!courierId) throw new Error('no courier assigned to this order');
  const courier = await p.courier.findUnique({ where: { id: courierId }, select: { id: true, name: true, tokenVersion: true } });

  // Start near restaurant, end at customer; fall back to Lund center if missing.
  const from = { lat: order.restaurant?.latitude ?? 55.7047, lng: order.restaurant?.longitude ?? 13.191 };
  const to = { lat: order.deliveryLatitude ?? 55.71, lng: order.deliveryLongitude ?? 13.20 };
  const token = jwt.sign({ courierId: courier.id, role: 'COURIER', tv: courier.tokenVersion }, JWT_SECRET, { expiresIn: '1h' });

  console.log(`Simulating courier "${courier.name}" for order ${order.orderNumber} (delivery=${order.delivery.status})`);
  console.log(`route ${from.lat.toFixed(4)},${from.lng.toFixed(4)} -> ${to.lat.toFixed(4)},${to.lng.toFixed(4)}`);

  for (let i = 1; i <= STEPS; i++) {
    const t = (i / STEPS) * MAX_FRAC;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    const res = await fetch(`${API}/api/courier/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat, lng }),
    });
    console.log(`  ${i}/${STEPS}  ${lat.toFixed(5)},${lng.toFixed(5)}  -> ${res.status}`);
    if (i < STEPS) await sleep(INTERVAL);
  }
  await p.$disconnect();
  console.log('done');
})().catch((e) => { console.error(e.message); process.exit(1); });
