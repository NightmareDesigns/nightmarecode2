const { app, BrowserWindow, clipboard, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const crypto = require('crypto');
const path = require('path');

const openedFiles = new Map();

ipcMain.handle('files:open', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ['openFile'],
    filters: [{ name: 'Code and text files', extensions: ['*'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const id = crypto.randomUUID();
  openedFiles.set(id, { owner: event.sender.id, filePath });
  return {
    id,
    name: path.basename(filePath),
    content: await fs.readFile(filePath, 'utf8')
  };
});

ipcMain.handle('files:save', async (event, { id, name, content, saveAs = false }) => {
  if (typeof content !== 'string') throw new TypeError('File contents must be text.');

  const existing = id ? openedFiles.get(id) : null;
  const ownedFile = existing?.owner === event.sender.id ? existing : null;
  let filePath = !saveAs && ownedFile ? ownedFile.filePath : null;

  if (!filePath) {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      defaultPath: name || 'untitled.txt'
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }

  await fs.writeFile(filePath, content, 'utf8');
  const nextId = crypto.randomUUID();
  openedFiles.set(nextId, { owner: event.sender.id, filePath });
  return { id: nextId, name: path.basename(filePath) };
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (event, text) => {
  if (typeof text !== 'string') throw new TypeError('Clipboard contents must be text.');
  clipboard.writeText(text);
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#000000',
    title: 'Nightmare Designs Code',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.webContents.once('destroyed', () => {
    for (const [id, file] of openedFiles) {
      if (file.owner === mainWindow.webContents.id) openedFiles.delete(id);
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'www', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
