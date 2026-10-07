import { spawnSync } from 'node:child_process';
process.env.NODE_ENV = 'development';
process.env.PORT ??= '8080';
const build = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
await import('./dist/index.mjs');
