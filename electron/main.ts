import {
  app,
  BrowserWindow,
  Menu,
  screen,
  type MenuItemConstructorOptions,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initDb, closeDb } from './db/index';
import { getAllSettings, setSetting } from './db/settings';
import { registerIpc } from './ipc';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_NAME = 'InkNel';

// macOS のアプリメニュー名はバンドルの CFBundleName から決まるが、
// 開発中（unpackaged）は app.setName() を whenReady より前に呼ぶことで上書きできる。
app.setName(APP_NAME);

// ----- 単一インスタンスロック -----
// 2つ目の起動を試みた場合は既存ウィンドウをフォーカスして自分は終了する。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function sendToRenderer(channel: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel);
  }
}

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const, label: `${APP_NAME} について` },
              {
                label: '設定...',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendToRenderer('menu:open-preferences'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: `${APP_NAME} を隠す` },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: `${APP_NAME} を終了` },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'ファイル',
      submenu: [
        ...(isMac
          ? []
          : ([
              {
                label: '設定...',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendToRenderer('menu:open-preferences'),
              },
              { type: 'separator' as const },
            ] as MenuItemConstructorOptions[])),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'ウィンドウ',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ----- ウィンドウ状態の保存/復元 -----

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const DEFAULT_BOUNDS: WindowBounds = { width: 1200, height: 800 };

function loadWindowBounds(): { bounds: WindowBounds; maximized: boolean } {
  const settings = getAllSettings();
  const raw = settings['window.bounds'];
  let bounds: WindowBounds = DEFAULT_BOUNDS;
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Partial<WindowBounds>;
      if (
        typeof obj.width === 'number' &&
        typeof obj.height === 'number' &&
        obj.width >= 400 &&
        obj.height >= 300
      ) {
        bounds = {
          x: typeof obj.x === 'number' ? obj.x : undefined,
          y: typeof obj.y === 'number' ? obj.y : undefined,
          width: obj.width,
          height: obj.height,
        };
      }
    } catch {
      // 不正な JSON は無視
    }
  }

  // 復元位置が現在のディスプレイ範囲外なら無視
  if (bounds.x !== undefined && bounds.y !== undefined) {
    const displays = screen.getAllDisplays();
    const inside = displays.some((d) => {
      const a = d.workArea;
      return (
        bounds.x! >= a.x &&
        bounds.y! >= a.y &&
        bounds.x! + bounds.width <= a.x + a.width &&
        bounds.y! + bounds.height <= a.y + a.height
      );
    });
    if (!inside) {
      bounds = { width: bounds.width, height: bounds.height };
    }
  }

  const maximized = settings['window.maximized'] === 'true';
  return { bounds, maximized };
}

function saveWindowBounds(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  // 最大化/最小化/フルスクリーン中は bounds を上書きしない
  if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) {
    setSetting('window.maximized', win.isMaximized() ? 'true' : 'false');
    return;
  }
  const b = win.getBounds();
  setSetting(
    'window.bounds',
    JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height }),
  );
  setSetting('window.maximized', 'false');
}

function createWindow(): void {
  const { bounds, maximized } = loadWindowBounds();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: APP_NAME,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (maximized) {
    mainWindow.maximize();
  }

  // resize / move を 300ms デバウンスで保存
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (mainWindow) saveWindowBounds(mainWindow);
    }, 300);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);
  mainWindow.on('maximize', scheduleSave);
  mainWindow.on('unmaximize', scheduleSave);

  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (mainWindow) saveWindowBounds(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initDb();
  registerIpc();
  buildAppMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  closeDb();
});
