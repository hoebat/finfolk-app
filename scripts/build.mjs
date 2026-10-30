import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = existsSync('.env')
  ? '.env'
  : existsSync('.env.local')
    ? '.env.local'
    : null;
if (file) process.loadEnvFile(file);
try {
  execFileSync(
    process.env.PYTHON || 'python3',
    ['-m', 'depth_explorer', 'build-static'],
    { stdio: 'inherit', env: process.env },
  );
} catch (error) {
  process.exit(error.status || 1);
}
