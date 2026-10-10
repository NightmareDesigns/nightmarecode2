const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { pathToFileURL } = require('url');

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024;
const MAX_WORKSPACE_ENTRIES = 10000;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build']);
let mainWindow;
let workspaceRoot = null;
const openedFiles = new Map();

function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted application request.');
  }
}

function resolveWorkspaceFile(relativePath) {
  if (!workspaceRoot || typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error('Open a workspace and select a file first.');
  }

  const normalized = relativePath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Invalid workspace path.');
  }

  const absolutePath = path.resolve(workspaceRoot, normalized);
  const relativeToRoot = path.relative(workspaceRoot, absolutePath);
  if (!relativeToRoot || relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error('File is outside the workspace.');
  }
  return absolutePath;
}

async function assertNoSymlink(absolutePath) {
  const relativePath = path.relative(workspaceRoot, absolutePath);
  let currentPath = workspaceRoot;
  for (const part of relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, part);
    try {
      const stats = await fs.lstat(currentPath);
      if (stats.isSymbolicLink()) throw new Error('Symbolic links are not supported in the workspace.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function readTextFile(absolutePath) {
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile() || stats.size > MAX_TEXT_FILE_SIZE) {
    throw new Error('Only text files up to 2 MB can be opened.');
  }
  return fs.readFile(absolutePath, 'utf8');
}

ipcMain.handle('workspace:open', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  workspaceRoot = await fs.realpath(result.filePaths[0]);
  return {
    name: path.basename(workspaceRoot),
    id: createHash('sha256').update(workspaceRoot).digest('hex'),
    files: await listWorkspaceFiles()
  };
});

async function listWorkspaceFiles() {
  const files = [];
  async function visit(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_WORKSPACE_ENTRIES) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push({ path: relativePath, directory: true });
        await visit(path.join(directory, entry.name), relativePath);
      } else if (entry.isFile()) {
        files.push({ path: relativePath, directory: false });
      }
    }
  }
  await visit(workspaceRoot);
  return files;
}

ipcMain.handle('workspace:read', async (event, relativePath) => {
  assertTrustedSender(event);
  const absolutePath = resolveWorkspaceFile(relativePath);
  await assertNoSymlink(absolutePath);
  return readTextFile(absolutePath);
});

ipcMain.handle('workspace:write', async (event, relativePath, content) => {
  assertTrustedSender(event);
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT_FILE_SIZE) {
    throw new Error('Text files must be smaller than 2 MB.');
  }
  const absolutePath = resolveWorkspaceFile(relativePath);
  await assertNoSymlink(absolutePath);
  const parent = path.dirname(absolutePath);
  if ((await fs.stat(parent)).isDirectory() === false) throw new Error('Invalid workspace directory.');
  await fs.writeFile(absolutePath, content, { encoding: 'utf8', flag: 'w' });
  return true;
});

ipcMain.handle('file:open', async (event) => {
  assertTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await readTextFile(filePath);
  const token = randomUUID();
  openedFiles.set(token, filePath);
  return { name: path.basename(filePath), content, token };
});

ipcMain.handle('file:save-as', async (event, content) => {
  assertTrustedSender(event);
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT_FILE_SIZE) {
    throw new Error('Text files must be smaller than 2 MB.');
  }
  const result = await dialog.showSaveDialog(mainWindow);
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, 'utf8');
  const token = randomUUID();
  openedFiles.set(token, result.filePath);
  return { name: path.basename(result.filePath), token };
});

ipcMain.handle('file:save', async (event, token, content) => {
  assertTrustedSender(event);
  const filePath = openedFiles.get(token);
  if (!filePath) throw new Error('Save this file using Save As first.');
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT_FILE_SIZE) {
    throw new Error('Text files must be smaller than 2 MB.');
  }
  const stats = await fs.lstat(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('The selected file is no longer a regular file.');
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#000000',
    title: 'Nightmare Designs Code',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const appUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appUrl) event.preventDefault();
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

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
