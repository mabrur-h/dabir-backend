/**
 * Test script to validate Telegram initData hash
 *
 * Usage: node test-telegram-hash.js "<initDataRaw>"
 *
 * Get initDataRaw from the frontend console log or from network tab
 */

const crypto = require('crypto');

const botToken = '8576202136:AAHGuXxQEAEOP_m4YJfaWX55shKl4yZGfi8';

// Get initDataRaw from command line or use example
const initDataRaw = process.argv[2] || 'query_id=test&user={"id":123}&auth_date=123&hash=abc';

console.log('=== Telegram Hash Validation Test ===\n');
console.log('Bot Token:', botToken.substring(0, 10) + '...');
console.log('InitDataRaw:', initDataRaw.substring(0, 100) + '...\n');

// Parse the URL-encoded data
const params = new URLSearchParams(initDataRaw);
const data = {};
for (const [key, value] of params.entries()) {
  data[key] = value;
}

console.log('Parsed fields:', Object.keys(data));
console.log('Hash from data:', data.hash);
console.log('Signature from data:', data.signature || 'none');
console.log('');

// Build data check string (excluding hash and signature, sorted alphabetically)
const dataCheckString = Object.keys(data)
  .filter(key => key !== 'hash' && key !== 'signature')
  .sort()
  .map(key => `${key}=${data[key]}`)
  .join('\n');

console.log('Data check string:');
console.log('---');
console.log(dataCheckString);
console.log('---\n');

// Create secret key: HMAC_SHA256("WebAppData", bot_token)
const secretKey = crypto
  .createHmac('sha256', 'WebAppData')
  .update(botToken)
  .digest();

console.log('Secret key (hex):', secretKey.toString('hex'));

// Calculate hash
const calculatedHash = crypto
  .createHmac('sha256', secretKey)
  .update(dataCheckString)
  .digest('hex');

console.log('Calculated hash:', calculatedHash);
console.log('Provided hash:  ', data.hash);
console.log('Match:', calculatedHash === data.hash ? '✅ YES' : '❌ NO');

// Also show user field for inspection
if (data.user) {
  console.log('\nUser field (decoded):');
  console.log(data.user);
  try {
    const parsed = JSON.parse(data.user);
    console.log('User parsed:', JSON.stringify(parsed));
  } catch (e) {
    console.log('Failed to parse user JSON:', e.message);
  }
}
