// Loaded via `node --require` before tests so dotenv cannot override these.
process.env.EMAIL_PROVIDER = 'memory';
process.env.IMAGE_STORAGE = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = process.env.COVE_GRANT_TRIAL_ON_REGISTER || 'true';
process.env.COVE_ENFORCE_BILLING = process.env.COVE_ENFORCE_BILLING || 'false';
// Makes config/env.js ignore MONGODB_URI and config/db.js refuse to connect.
process.env.COVE_TEST_MODE = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-not-used-anywhere-else-0000';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Fail the whole run before any test file starts if the test database is missing or unsafe.
require('./_testDb').resolveTestDatabase();
