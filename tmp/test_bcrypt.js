
const bcrypt = require('bcryptjs');

async function test() {
  const password = 'test';
  const hash = await bcrypt.hash(password, 10);
  console.log('Hash:', hash);
  const match = await bcrypt.compare(password, hash);
  console.log('Match:', match);
}

test();
