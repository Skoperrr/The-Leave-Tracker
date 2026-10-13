// Creates local server secrets without printing them. Never commit .env.
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
const filename = new URL('../.env', import.meta.url);
let source = fs.readFileSync(filename, 'utf8');
const values = parseEnv(source);
const defaults = {
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: 'https://the-leave-tracker-skfc.vercel.app/api/v1/integrations/google/callback',
  GOOGLE_FRONTEND_RETURN_URL: 'https://the-leave-tracker-skfc.vercel.app/admin',
  GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), GOOGLE_TOKEN_KEY_VERSION: '1',
  GOOGLE_INVITATION_LIMIT: '100', CRON_SECRET: randomBytes(32).toString('base64url'),
};
for (const [key, value] of Object.entries(defaults)) {
  if (values[key]) continue;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(source)) source = source.replace(pattern, `${key}=${value}`);
  else source += `\n${key}=${value}\n`;
}
fs.writeFileSync(filename, source, { mode: 0o600 }); fs.chmodSync(filename, 0o600);
console.info('Local calendar settings prepared in backend/.env. Add Google client ID/secret locally and copy server settings into Vercel; no secrets displayed.');
