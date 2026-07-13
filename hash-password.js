/**
 * One-time helper: generates the bcrypt hash you put into .env as ADMIN_PASSWORD_HASH.
 * Usage:  node hash-password.js "your-real-admin-password"
 */
const bcrypt = require('bcryptjs');
const password = process.argv[2];
if (!password) {
  console.error('Usage: node hash-password.js "your-password"');
  process.exit(1);
}
bcrypt.hash(password, 12).then(hash => {
  console.log('\nAdd this line to your .env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
