// Electron main process.
//
// Privacy first: this app makes NO network requests. All data lives in a single
// local JSON file under the OS user-data dir. Nothing is ever sent anywhere.
// The renderer is locked down (contextIsolation on, nodeIntegration off,
// sandboxed) and talks to disk only through the IPC handlers below.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFile = () => path.join(app.getPath('userData'), 'navtool-data.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return null; // no file yet (first run) or unreadable → renderer seeds defaults
  }
}

function saveData(data) {
  try {
    // Atomic-ish write: write to a temp file then rename, so a crash mid-write
    // can't corrupt the only copy of her data.
    const f = dataFile();
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, f);
    return true;
  } catch (e) {
    return false;
  }
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#f5f6f8',
    title: 'Oppfølging',
    autoHideMenuBar: true, // keep a clean look; Alt reveals the menu
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Minimal menu — mostly so Cmd/Ctrl+Q, copy/paste, and a "vis datafil" helper exist.
function buildMenu() {
  const template = [
    {
      label: 'Fil',
      submenu: [
        { label: 'Vis datafil i mappe', click: () => shell.showItemInFolder(dataFile()) },
        { type: 'separator' },
        { role: 'quit', label: 'Avslutt' },
      ],
    },
    { label: 'Rediger', role: 'editMenu' },
    {
      label: 'Vis',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  // Auto-update from GitHub Releases. No-ops in dev / when unpackaged, and any
  // failure (offline, no release yet) is swallowed so it never blocks the app.
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch (_) { /* updater unavailable — ignore */ }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: the only bridge between the locked-down UI and the disk ---
ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_e, data) => saveData(data));
ipcMain.handle('data:dataPath', () => dataFile());
ipcMain.handle('data:reveal', () => shell.showItemInFolder(dataFile()));

ipcMain.handle('data:export', async (_e, data) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Eksporter sikkerhetskopi',
    defaultPath: `oppfolging-sikkerhetskopi-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importer sikkerhetskopi',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return null;
  try {
    return JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  } catch {
    return null;
  }
});
