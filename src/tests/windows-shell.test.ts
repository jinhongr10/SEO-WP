import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const shell = require('../../desktop/windows-shell.cjs') as {
  createWindowsMenuTemplate: () => Array<Record<string, unknown>>;
  installWindowsMenu: (options: {
    platform: string;
    Menu: {
      buildFromTemplate?: (template: Array<Record<string, unknown>>) => unknown;
      setApplicationMenu: (menu: unknown) => void;
    };
  }) => boolean;
  attachWindowsDevShortcuts: (options: {
    platform: string;
    isDevelopment: boolean;
    window: {
      isDestroyed?: () => boolean;
      webContents: {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
        reload: () => void;
        reloadIgnoringCache: () => void;
        toggleDevTools: () => void;
      };
    };
  }) => boolean;
  getWindowBackgroundColor: (platform: string, shouldUseDarkColors: boolean) => string;
  showAboutDialog: (options: {
    dialog: { showMessageBox: (...args: unknown[]) => unknown };
    app: { getVersion: () => string };
    parentWindow: { isDestroyed: () => boolean } | null;
  }) => unknown;
};

const projectFile = (relativePath: string) => new URL(`../../${relativePath}`, import.meta.url);

test('Windows menu template is empty so no native File/Edit strip is defined', () => {
  assert.deepEqual(shell.createWindowsMenuTemplate(), []);
});

test('About dialog uses an unparented overload when no live main window exists', () => {
  const calls: unknown[][] = [];
  const dialog = { showMessageBox: (...args: unknown[]) => { calls.push(args); } };
  const app = { getVersion: () => '1.2.3' };

  shell.showAboutDialog({ dialog, app, parentWindow: null });
  shell.showAboutDialog({ dialog, app, parentWindow: { isDestroyed: () => true } });
  const liveWindow = { isDestroyed: () => false };
  shell.showAboutDialog({ dialog, app, parentWindow: liveWindow });

  assert.equal(calls[0].length, 1);
  assert.equal(calls[1].length, 1);
  assert.equal(calls[2].length, 2);
  assert.deepEqual(calls[0][0], {
    type: 'info',
    title: '关于独立站 AI',
    message: '独立站 AI',
    detail: '版本 1.2.3',
    buttons: ['确定'],
  });
  assert.equal(calls[2][0], liveWindow);
});

test('Windows menu installation clears the application menu only on win32', () => {
  const calls: Array<[string, unknown]> = [];
  const Menu = {
    setApplicationMenu: (menu: unknown) => { calls.push(['set', menu]); },
  };

  assert.equal(shell.installWindowsMenu({ platform: 'win32', Menu }), true);
  assert.deepEqual(calls, [['set', null]]);

  calls.length = 0;
  assert.equal(shell.installWindowsMenu({ platform: 'darwin', Menu }), false);
  assert.deepEqual(calls, []);
  assert.equal(shell.installWindowsMenu({ platform: 'linux', Menu }), false);
  assert.deepEqual(calls, []);
});

test('Windows dev shortcuts attach only on win32 development windows', () => {
  const handlers: Array<[string, (...args: unknown[]) => void]> = [];
  const actions: string[] = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      on: (event: string, handler: (...args: unknown[]) => void) => { handlers.push([event, handler]); },
      reload: () => { actions.push('reload'); },
      reloadIgnoringCache: () => { actions.push('reloadIgnoringCache'); },
      toggleDevTools: () => { actions.push('toggleDevTools'); },
    },
  };

  assert.equal(shell.attachWindowsDevShortcuts({
    platform: 'darwin',
    isDevelopment: true,
    window,
  }), false);
  assert.equal(handlers.length, 0);

  assert.equal(shell.attachWindowsDevShortcuts({
    platform: 'win32',
    isDevelopment: false,
    window,
  }), false);
  assert.equal(handlers.length, 0);

  assert.equal(shell.attachWindowsDevShortcuts({
    platform: 'win32',
    isDevelopment: true,
    window,
  }), true);
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0][0], 'before-input-event');

  const handler = handlers[0][1];
  const prevented: boolean[] = [];
  const preventDefault = () => { prevented.push(true); };

  handler({ preventDefault }, { type: 'keyDown', key: 'r', control: true, shift: false, alt: false });
  handler({ preventDefault }, { type: 'keyDown', key: 'r', control: true, shift: true, alt: false });
  handler({ preventDefault }, { type: 'keyDown', key: 'i', control: true, shift: true, alt: false });
  handler({ preventDefault }, { type: 'keyDown', key: 'F12', control: false, shift: false, alt: false });

  assert.deepEqual(actions, ['reload', 'reloadIgnoringCache', 'toggleDevTools', 'toggleDevTools']);
  assert.equal(prevented.length, 4);
});

test('Windows uses dark-aware launch colors while macOS and Linux retain the light shell color', () => {
  assert.equal(shell.getWindowBackgroundColor('win32', true), '#080b0f');
  assert.equal(shell.getWindowBackgroundColor('win32', false), '#f7f8fb');
  assert.equal(shell.getWindowBackgroundColor('darwin', true), '#f7f8fb');
  assert.equal(shell.getWindowBackgroundColor('linux', true), '#f7f8fb');
});

test('Electron main clears the Windows menu before creating the window and keeps native macOS title controls', async () => {
  const source = await readFile(projectFile('desktop/main.cjs'), 'utf8');

  assert.match(source, /const \{ app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeTheme,[^}]+ \} = require\('electron'\)/);
  assert.match(source, /installWindowsMenu\([\s\S]*?\);[\s\S]*?await createWindow\(\)/);
  assert.match(source, /autoHideMenuBar:\s*process\.platform === 'win32'/);
  assert.match(source, /window\.setMenuBarVisibility\(false\)/);
  assert.match(source, /window\.setMenu\(null\)/);
  assert.match(source, /attachWindowsDevShortcuts\(/);
  assert.match(source, /titleBarStyle:\s*process\.platform === 'darwin' \? 'hiddenInset' : 'default'/);
  assert.match(source, /trafficLightPosition:\s*process\.platform === 'darwin' \? \{ x: 12, y: 16 \} : undefined/);
});

test('Electron main updates the Windows window background and localizes native dialogs', async () => {
  const source = await readFile(projectFile('desktop/main.cjs'), 'utf8');

  assert.match(source, /backgroundColor:\s*getWindowBackgroundColor\(process\.platform, nativeTheme\.shouldUseDarkColors\)/);
  assert.match(source, /mainWindow\.setBackgroundColor\(getWindowBackgroundColor\(process\.platform, nativeTheme\.shouldUseDarkColors\)\)/);
  assert.match(source, /title:\s*'选择 Vertex 服务账号 JSON'/);
  assert.match(source, /title:\s*'导出诊断信息'/);
  assert.match(source, /'独立站 AI 启动失败'/);
  // About is no longer on a native Help menu; shell helper remains for optional in-app use.
  assert.doesNotMatch(source, /showAboutDialog/);
});

test('Electron preload exposes the static host platform without another IPC channel', async () => {
  const source = await readFile(projectFile('desktop/preload.cjs'), 'utf8');

  assert.match(source, /contextBridge\.exposeInMainWorld\('seoWpSyncDesktop',\s*\{[\s\S]*?platform:\s*process\.platform/);
  assert.doesNotMatch(source, /desktop\.getPlatform/);
});
