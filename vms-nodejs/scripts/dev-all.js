#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function startProcess(name, args, extraEnv = {}) {
  const child = spawn(npmCmd, args, {
    cwd: projectDir,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`\n[${name}] exited with ${reason}`);
  });

  child.on('error', (err) => {
    console.error(`\n[${name}] failed to start: ${err.message}`);
  });

  return child;
}

function shutdown(children) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

if (!fs.existsSync(path.join(projectDir, 'node_modules'))) {
  console.error('Dependencies not found. Run: npm install');
  process.exit(1);
}

console.log('Starting VMS API (5001) and Frontend (3000)...');
console.log('Press Ctrl+C to stop both.\n');

const api = startProcess('API', ['run', 'api'], { PORT: '5001' });
const web = startProcess('Frontend', ['run', 'dev']);
const children = [api, web];

let isShuttingDown = false;
function handleSignal(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}, stopping services...`);
  shutdown(children);
  setTimeout(() => process.exit(0), 1200);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));
