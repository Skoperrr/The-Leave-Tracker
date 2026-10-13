import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDatabaseEnvironment } from '../config/database-env.js';

try {
  readDatabaseEnvironment();
  const cli = fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url));
  const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'inherit', windowsHide: true });
  child.once('error', () => { console.error('Could not start the migration tool'); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
} catch {
  console.error('Configure PostgreSQL and public Supabase settings locally before applying the reviewed migrations');
  process.exitCode = 1;
}
