// Loaded via `node --require` before tests so dotenv cannot override these.
process.env.EMAIL_PROVIDER = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = process.env.COVE_GRANT_TRIAL_ON_REGISTER || 'true';
process.env.COVE_ENFORCE_BILLING = process.env.COVE_ENFORCE_BILLING || 'false';
