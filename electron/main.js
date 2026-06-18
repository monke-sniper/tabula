const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let pythonProcess = null;
const BACKEND_PORT = 8420;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

function startPythonBackend() {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const venvPy = process.platform === 'win32'
    ? path.join(BACKEND_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(BACKEND_DIR, '.venv', 'bin', 'python');
  const fs = require('fs');
  const cmd = fs.existsSync(venvPy) ? venvPy : pythonCmd;
  pythonProcess = spawn(cmd, [
    '-m', 'uvicorn', 'main:app',
    '--port', String(BACKEND_PORT),
    '--host', '127.0.0.1',
  ], {
    cwd: BACKEND_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  pythonProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log('[Python]', msg);
    if (mainWindow && msg.includes('Uvicorn running')) {
      mainWindow.webContents.send('backend-ready');
    }
    if (mainWindow && msg.includes('chronos model ready')) {
      mainWindow.webContents.send('model-warmed');
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('[Python]', data.toString());
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python backend exited with code ${code}`);
    pythonProcess = null;
  });
}

function stopPythonBackend() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Tabula',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Data File',
    filters: [
      { name: 'Data Files', extensions: ['csv', 'json', 'xlsx', 'xls', 'parquet'] },
      { name: 'CSV', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'Excel', extensions: ['xlsx', 'xls'] },
      { name: 'Parquet', extensions: ['parquet'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('get-backend-url', () => {
  return `http://127.0.0.1:${BACKEND_PORT}`;
});

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopPythonBackend();
});
