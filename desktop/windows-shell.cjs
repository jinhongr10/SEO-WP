const getWindowBackgroundColor = (platform, shouldUseDarkColors) => (
  platform === 'win32' && shouldUseDarkColors ? '#080b0f' : '#f7f8fb'
);

const showAboutDialog = ({ dialog, app, parentWindow }) => {
  const options = {
    type: 'info',
    title: '关于独立站 AI',
    message: '独立站 AI',
    detail: `版本 ${app.getVersion()}`,
    buttons: ['确定'],
  };
  if (parentWindow && !parentWindow.isDestroyed()) {
    return dialog.showMessageBox(parentWindow, options);
  }
  return dialog.showMessageBox(options);
};

/**
 * Windows keeps a frameless chrome: no File/Edit/View menu strip.
 * Edit shortcuts still work inside inputs via Chromium; Alt+F4 quits.
 * Dev reload / DevTools are wired in main via before-input-event when unpackaged.
 */
const createWindowsMenuTemplate = () => [];

const installWindowsMenu = ({ platform, Menu }) => {
  if (platform !== 'win32') return false;
  // null removes the native menu bar entirely (cleaner than auto-hide).
  Menu.setApplicationMenu(null);
  return true;
};

const attachWindowsDevShortcuts = ({ platform, isDevelopment, window }) => {
  if (platform !== 'win32' || !isDevelopment || !window || window.isDestroyed?.()) return false;

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = Boolean(input.control || input.meta);

    if (ctrl && !input.alt && key === 'r') {
      event.preventDefault();
      if (input.shift) window.webContents.reloadIgnoringCache();
      else window.webContents.reload();
      return;
    }

    if (ctrl && input.shift && key === 'i') {
      event.preventDefault();
      window.webContents.toggleDevTools();
      return;
    }

    if (key === 'f12') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });

  return true;
};

module.exports = {
  attachWindowsDevShortcuts,
  createWindowsMenuTemplate,
  getWindowBackgroundColor,
  installWindowsMenu,
  showAboutDialog,
};
