import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const VENV_DIR = path.join(BACKEND_DIR, '.venv');
const VENV_PY = process.platform === 'win32'
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python');
const REQS = path.join(BACKEND_DIR, 'requirements.txt');
const BACKEND_PORT = 8420;
const FRONTEND_PORT = 5173;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const CYN = (s) => `\x1b[36m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

const banner = `
${YEL('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501')}
  ${YEL('\u2588')} ${GRN('TABULA')} ${DIM(':: FORECAST ENGINE')}
  ${DIM('model-agnostic  \u00b7  multi-model ensemble  \u00b7  real-time EDA')}
${YEL('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501')}
`;

const stamp = () => DIM(new Date().toLocaleTimeString('en-US', { hour12: false }));
const log = (kind, msg) => console.log(`${stamp()} ${kind} ${msg}`);

function checkTool(cmd, args, label) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'pipe', shell: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('error', () => resolve({ ok: false, version: 'missing' }));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true, version: out.trim().split('\n')[0] });
      else resolve({ ok: false, version: 'missing' });
    });
  });
}

function ensureVenv() {
  if (existsSync(VENV_PY)) return Promise.resolve(true);
  log(YEL('[BOOT]'), `creating venv at ${DIM(VENV_DIR)}`);
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-m', 'venv', VENV_DIR], { stdio: 'inherit', shell: true });
    py.on('close', (code) => {
      if (code !== 0) return reject(new Error('venv creation failed'));
      const pip = spawn(VENV_PY, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit', shell: true });
      pip.on('close', (cp) => {
        if (cp !== 0) return reject(new Error('pip upgrade failed'));
        const req = spawn(VENV_PY, ['-m', 'pip', 'install', '-r', REQS], { stdio: 'inherit', shell: true });
        req.on('close', (cr) => (cr === 0 ? resolve(true) : reject(new Error('pip install requirements failed'))));
      });
    });
  });
}

function healthProbe(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        if (Date.now() > deadline) return reject(new Error(`health probe failed: ${res.statusCode}`));
        setTimeout(tryOnce, 500);
      });
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error('health probe timed out'));
        setTimeout(tryOnce, 500);
      });
      req.setTimeout(2000, () => req.destroy(new Error('socket timeout')));
    };
    tryOnce();
  });
}

function spawnColored(name, color, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: 'pipe', shell: true, env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '1' } });
  const prefix = (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) console.log(`${stamp()} ${color(name)} ${line}`);
  };
  p.stdout.on('data', prefix);
  p.stderr.on('data', prefix);
  p.on('close', (code) => {
    log(DIM(`[${name}]`), `exited with code ${code}`);
    if (code !== 0 && !shuttingDown) {
      log(RED('[FATAL]'), `${name} exited; killing remaining children`);
      shutdown(1);
    }
  });
  return p;
}

let shuttingDown = false;
const children = [];

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(YEL('[STOP]'), 'shutting down...');
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code), 800);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  console.log(banner);

  const node = await checkTool('node', ['--version'], 'node');
  if (!node.ok) {
    log(RED('[FAIL]'), 'node not found on PATH');
    process.exit(1);
  }
  log(GRN('[OK]'), `node ${node.version}`);

  const py = await checkTool('python', ['--version'], 'python');
  if (!py.ok) {
    log(RED('[FAIL]'), 'python not found on PATH');
    process.exit(1);
  }
  log(GRN('[OK]'), `python ${py.version}`);

  if (existsSync(VENV_PY)) {
    log(GRN('[OK]'), `venv ready at ${DIM(VENV_DIR)}`);
  } else {
    await ensureVenv();
  }

  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    log(YEL('[BOOT]'), 'installing node_modules...');
    const npm = spawn('npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: true });
    await new Promise((resolve) => npm.on('close', () => resolve()));
    log(GRN('[OK]'), 'node_modules ready');
  } else {
    log(GRN('[OK]'), 'node_modules present');
  }

  log(YEL('[START]'), `backend -> :${BACKEND_PORT}   frontend -> :${FRONTEND_PORT}`);

  children.push(spawnColored('backend', CYN, 'npm', ['run', '-s', 'backend'], ROOT));
  await new Promise((r) => setTimeout(r, 1500));
  children.push(spawnColored('frontend', YEL, 'npm', ['run', '-s', 'dev'], ROOT));

  try {
    await healthProbe(HEALTH_URL, 30000);
    log(GRN('[OK]'), `backend healthy at ${DIM(HEALTH_URL)}`);
    console.log(`${GRN('\u2713')} ${CYN('TABULA')} ready - open ${GRN(`http://localhost:${FRONTEND_PORT}`)}`);
  } catch (e) {
    log(RED('[FAIL]'), `backend never became healthy: ${e.message}`);
    shutdown(1);
  }
}

main().catch((e) => {
  log(RED('[FATAL]'), e.message);
  shutdown(1);
});
