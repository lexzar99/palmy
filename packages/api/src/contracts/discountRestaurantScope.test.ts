import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { discountCodeAppliesToRestaurant, discountCodeIsRestaurantScoped } from '../lib/discountRestaurantScope';

// DEMO1-fallet: koden gäller två restauranger och ska nekas överallt annars.
const demo = { applicableRestaurantIds: JSON.stringify(['wanthai', 'roma']), restaurantId: null };
assert.equal(discountCodeIsRestaurantScoped(demo), true);
assert.equal(discountCodeAppliesToRestaurant(demo, 'wanthai'), true);
assert.equal(discountCodeAppliesToRestaurant(demo, 'roma'), true);
assert.equal(discountCodeAppliesToRestaurant(demo, 'palmyra'), false);
assert.equal(discountCodeAppliesToRestaurant(demo, null), false);

// Äldre kod med bara restaurantId.
const single = { applicableRestaurantIds: '[]', restaurantId: 'palmyra' };
assert.equal(discountCodeIsRestaurantScoped(single), true);
assert.equal(discountCodeAppliesToRestaurant(single, 'palmyra'), true);
assert.equal(discountCodeAppliesToRestaurant(single, 'roma'), false);

// Global kod (VIAEATS30) gäller överallt, även utan restaurang.
const global = { applicableRestaurantIds: '[]', restaurantId: null };
assert.equal(discountCodeIsRestaurantScoped(global), false);
assert.equal(discountCodeAppliesToRestaurant(global, 'roma'), true);
assert.equal(discountCodeAppliesToRestaurant(global, undefined), true);

// Kassans validering och orderläggningen använder samma regel.
const discountRoute = fs.readFileSync(path.join(__dirname, '../routes/discount.ts'), 'utf8');
const ordersRoute = fs.readFileSync(path.join(__dirname, '../routes/orders.ts'), 'utf8');
assert.match(discountRoute, /discountCodeAppliesToRestaurant\(discount as any, rid\)/);
assert.match(ordersRoute, /discountCodeAppliesToRestaurant\(code as any, restaurant\.id\)/);

console.log('Rabattkodens restaurangscope: kassa och order delar regel, ok');
