import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const children = [];
let shuttingDown = false;

function start(label, args, env = process.env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push({ label, child });
  child.on('error', (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${label}] exited unexpectedly (code=${code}, signal=${signal ?? 'none'}).`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(isWindows ? undefined : 'SIGTERM');
    }
  }
  const timer = setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 2500);
  timer.unref();
  Promise.all(children.map(({ child }) => new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolveExit();
    child.once('exit', resolveExit);
  }))).finally(() => {
    clearTimeout(timer);
    process.exit(exitCode);
  });
}

process.once('SIGINT', () => shutdown(130));
process.once('SIGTERM', () => shutdown(143));

start('api', ['server/index.js'], { ...process.env, NODE_ENV: 'development', API_PORT: process.env.API_PORT || '3001' });
start('vite', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '3000', '--strictPort']);
