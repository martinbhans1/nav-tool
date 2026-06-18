// Electron main process.
//
// Privacy first: this app makes NO network requests. All data lives in a single
// local JSON file under the OS user-data dir. Nothing is ever sent anywhere.
// The renderer is locked down (contextIsolation on, nodeIntegration off,
// sandboxed) and talks to disk only through the IPC handlers below.

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
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
    fs.mkdirSync(path.dirname(f), { recursive: true }); // ensure the dir exists
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, f);
    return true;
  } catch (e) {
    return false;
  }
}

let win;
let flushing = false;   // true while we wait for the renderer to persist on close
let installing = false; // true while we're flushing-then-installing an update

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#f5f6f8',
    title: 'Oppfølging',
    icon: path.join(__dirname, 'renderer', 'logo.png'),
    // Frameless: we draw our own title bar (min/max/close) in the renderer so the
    // controls merge into the app background — no black OS chrome. The window is
    // still resizable (Electron keeps invisible resize handles).
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Keep the renderer's maximize/restore icon in sync with the real state.
  const sendMaxState = () => {
    if (win && !win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized());
  };
  win.on('maximize', sendMaxState);
  win.on('unmaximize', sendMaxState);

  // Flush-on-close: saves are debounced in the renderer, so closing right after
  // a change could drop it. Hold the close, ask the renderer to persist now, and
  // only then actually close. A short timeout guarantees we never hang shut.
  //
  // When `installing` is true (the user chose "Start på nytt" to apply an
  // update), we still flush her data, but instead of merely destroying the
  // window we hand off to `finishInstall()` so the new version actually gets
  // installed. The `app:flushed` IPC and the safety timeout both route through
  // the same guarded path so install fires exactly once.
  win.on('close', (e) => {
    if (flushing || !win || win.isDestroyed()) return;
    e.preventDefault();
    flushing = true;
    win.webContents.send('app:flush');
    setTimeout(closeOrInstall, 1200);
  });
}

// Single, idempotent exit path shared by the flush timeout and `app:flushed`.
// If we're mid-install, quit-and-install; otherwise just destroy the window.
let exited = false;
function closeOrInstall() {
  if (exited) return;
  exited = true;
  if (installing && pendingUpdater) {
    try { pendingUpdater.quitAndInstall(); return; }
    catch (_) { /* fall through to a normal close so we never strand the app */ }
  }
  if (win && !win.isDestroyed()) win.destroy();
}

// Set once setupUpdater() runs in a packed app; used by closeOrInstall().
let pendingUpdater = null;

// Robust, *visible* auto-update. All states are forwarded to the renderer so
// the UI can show progress; errors are always swallowed so the updater can
// never crash or block the app. No-ops automatically when unpackaged (dev).
function setupUpdater() {
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (_) {
    return; // updater dependency unavailable — silently skip
  }
  pendingUpdater = autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (payload) => {
    try {
      if (win && !win.isDestroyed()) win.webContents.send('update:status', payload);
    } catch (_) { /* window gone — ignore */ }
  };

  autoUpdater.on('checking-for-update', () => send({ phase: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ phase: 'available', version: info && info.version }));
  autoUpdater.on('update-not-available', () => send({ phase: 'none' }));
  autoUpdater.on('download-progress', (p) => send({ phase: 'downloading', percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => send({ phase: 'downloaded', version: info && info.version }));
  autoUpdater.on('error', (err) => send({ phase: 'error', error: String((err && err.message) || err) }));

  const active = typeof autoUpdater.isUpdaterActive === 'function' ? autoUpdater.isUpdaterActive() : false;
  if (active) {
    // Initial check shortly after launch + a slow periodic check for sessions
    // that stay open for days. Both swallow errors.
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 60 * 60 * 1000);
  }

  // Manual "Se etter oppdateringer".
  ipcMain.handle('update:check', async () => {
    if (!active) return { phase: 'dev' };
    try {
      await autoUpdater.checkForUpdates();
      return { phase: 'checking' }; // events drive the rest of the UI
    } catch (e) {
      return { phase: 'error', error: String((e && e.message) || e) };
    }
  });

  // "Start på nytt" — install the downloaded update. Flush data first via the
  // close interceptor, which then routes to quitAndInstall (see closeOrInstall).
  ipcMain.handle('update:install', () => {
    if (installing) return;          // guard against double-fire
    installing = true;
    if (win && !win.isDestroyed()) {
      win.close();                   // triggers flush-on-close → closeOrInstall
    } else {
      try { autoUpdater.quitAndInstall(); } catch (_) { app.quit(); }
    }
  });
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

app.whenReady().then(async () => {
  buildMenu();
  // Always render from the files on disk, never a stale compiled cache. Electron
  // keeps a V8 code cache + disk cache for the file:// renderer keyed per app;
  // after an update (or while iterating in dev) the OLD cached renderer can be
  // served, so the UI looks unchanged even though the code changed. Clearing on
  // launch is negligible for a local app and guarantees you see the real build.
  try {
    await session.defaultSession.clearCodeCaches({ urls: [] });
    await session.defaultSession.clearCache();
  } catch (_) { /* ignore — not worth blocking startup */ }
  createWindow();
  // Auto-update from GitHub Releases. No-ops in dev / when unpackaged, and any
  // failure (offline, no release yet) is swallowed so it never blocks the app.
  try { setupUpdater(); } catch (_) { /* updater unavailable — ignore */ }
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

// --- IPC: custom window controls (frameless title bar) ---
ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
ipcMain.handle('win:maximizeToggle', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.handle('win:close', () => { if (win) win.close(); });
ipcMain.handle('win:isMaximized', () => !!(win && win.isMaximized()));
// renderer confirms its final save landed → finish closing (or install).
ipcMain.on('app:flushed', () => closeOrInstall());

// current app version — used by the Settings "Oppdateringer" UI.
ipcMain.handle('app:version', () => app.getVersion());

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
