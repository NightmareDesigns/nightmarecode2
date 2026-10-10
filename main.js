const { app, BrowserWindow, dialog, ipcMain, screen, session } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { createHash, randomUUID } = require('crypto');
const { pathToFileURL } = require('url');
const decompiler = require('./decompiler');

const MAX_TEXT_FILE_SIZE = 2 * 1024 * 1024;
const MAX_WORKSPACE_ENTRIES = 10000;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build']);
let mainWindow;
let trustedAppUrl = null;
let workspaceRoot = null;
let microphoneAllowedForSession = false;
let decompilationActive = false;
let unrestrictedTerminalEnabled = false;
let terminalShell = null;
let terminalOutputLength = 0;
const openedFiles = new Map();
const activeProcesses = new Map();
const MAX_AI_PROMPT_LENGTH = 16000;
const MAX_AI_CONTEXT_LENGTH = 50000;
const MAX_AI_RESPONSE_LENGTH = 32000;
const MAX_PROCESS_OUTPUT_LENGTH = 1024 * 1024;
const DECOMPILABLE_BINARY_EXTENSIONS = new Set(['.exe', '.dll', '.class', '.jar', '.wasm']);

function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url !== trustedAppUrl) {
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
  if (DECOMPILABLE_BINARY_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
    throw new Error('Binary decompilation inputs stay local and cannot be opened as AI text context.');
  }
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

  const selectedWorkspace = await fs.realpath(result.filePaths[0]);
  if (workspaceRoot !== selectedWorkspace) {
    unrestrictedTerminalEnabled = false;
    stopTerminalShell();
    sendTerminalState(false, '\n[Workspace changed; unrestricted terminal disabled.]\n');
  }
  workspaceRoot = selectedWorkspace;
  return {
    name: path.basename(workspaceRoot),
    id: createHash('sha256').update(workspaceRoot).digest('hex'),
    files: await listWorkspaceFiles()
  };
});

ipcMain.handle('display:info', (event) => {
  assertTrustedSender(event);
  return getMainWindowDisplayInfo();
});

ipcMain.handle('ai:complete', async (event, request) => {
  assertTrustedSender(event);
  if (!request || typeof request !== 'object') throw new Error('Invalid assistant request.');
  const endpoint = validateAiEndpoint(request.endpoint);
  const model = typeof request.model === 'string' ? request.model.trim() : '';
  const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
  const context = typeof request.context === 'string' ? request.context : '';
  const apiKey = typeof request.apiKey === 'string' ? request.apiKey.trim() : '';
  if (!model || model.length > 200) throw new Error('Enter a model name (up to 200 characters).');
  if (!prompt || prompt.length > MAX_AI_PROMPT_LENGTH) throw new Error('Prompt must be between 1 and 16,000 characters.');
  if (context.length > MAX_AI_CONTEXT_LENGTH) throw new Error('Included file context exceeds 50,000 characters.');
  if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('Invalid API key.');

  const messages = [
    { role: 'system', content: 'You are a coding assistant. Give clear, concise answers. When asked to edit code, provide the complete replacement content in a fenced code block and explain which file it belongs to. Never claim changes were applied.' }
  ];
  if (context) messages.push({ role: 'user', content: `Current file context (read-only; do not assume other files):\n${context}` });
  messages.push({ role: 'user', content: prompt });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false }),
    redirect: 'error',
    signal: AbortSignal.timeout(120000)
  });
  if (!response.body) throw new Error('AI provider returned an empty response.');
  const responseChunks = [];
  let responseLength = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    responseLength += value.byteLength;
    if (responseLength > 1024 * 1024) {
      await reader.cancel();
      throw new Error('AI provider response exceeded 1 MB.');
    }
    responseChunks.push(Buffer.from(value));
  }
  const raw = Buffer.concat(responseChunks).toString('utf8');
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}: ${raw.slice(0, 1000)}`);
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error('AI provider returned invalid JSON.');
  }
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== 'string') throw new Error('AI provider returned no assistant message.');
  return answer.slice(0, MAX_AI_RESPONSE_LENGTH);
});

ipcMain.handle('process:start', async (event, request) => {
  assertTrustedSender(event);
  if (!workspaceRoot) throw new Error('Open a workspace before running or building files.');
  if (activeProcesses.size > 0) throw new Error('A workspace process is already running.');
  if (!request || !['run', 'build'].includes(request.action)) throw new Error('Unsupported process action.');
  const filePath = resolveWorkspaceFile(request.file);
  await assertNoSymlink(filePath);
  const stats = await fs.lstat(filePath);
  if (!stats.isFile()) throw new Error('Select a regular source file.');
  const extension = path.extname(filePath).toLowerCase();
  let command;
  let args;
  const env = {
    PATH: process.env.PATH || '',
    SystemRoot: process.env.SystemRoot || '',
    USERPROFILE: process.env.USERPROFILE || '',
    HOME: process.env.HOME || '',
    TEMP: process.env.TEMP || os.tmpdir(),
    TMP: process.env.TMP || os.tmpdir()
  };

  if (extension === '.js' && request.action === 'run') {
    command = 'node';
    args = [filePath];
  } else if (extension === '.js' && request.action === 'build') {
    command = 'node';
    args = ['--check', filePath];
  } else if (extension === '.py' && request.action === 'run') {
    command = process.platform === 'win32' ? 'python' : 'python3';
    args = [filePath];
  } else if (extension === '.py' && request.action === 'build') {
    command = process.platform === 'win32' ? 'python' : 'python3';
    args = ['-m', 'py_compile', filePath];
    env.PYTHONPYCACHEPREFIX = path.join(os.tmpdir(), 'nightmarecode-python-cache');
  } else {
    throw new Error('Real Build/Run currently supports JavaScript (.js) and Python (.py) files only.');
  }

  const jobId = randomUUID();
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeProcesses.set(jobId, child);
  let outputLength = 0;
  const publishOutput = (chunk) => {
    if (outputLength >= MAX_PROCESS_OUTPUT_LENGTH) return;
    const text = chunk.toString('utf8').slice(0, MAX_PROCESS_OUTPUT_LENGTH - outputLength);
    outputLength += Buffer.byteLength(text, 'utf8');
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('process:output', { jobId, text });
    }
  };
  child.stdout.on('data', publishOutput);
  child.stderr.on('data', publishOutput);
  child.on('error', (error) => publishOutput(`\nCould not start ${command}: ${error.message}\n`));
  child.on('close', (code, signal) => {
    activeProcesses.delete(jobId);
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('process:complete', { jobId, code, signal });
    }
  });
  return { jobId, command: [command, ...args].join(' ') };
});

ipcMain.handle('process:stop', (event, jobId) => {
  assertTrustedSender(event);
  const child = activeProcesses.get(jobId);
  if (!child) return false;
  return child.kill();
});

ipcMain.handle('terminal:set-enabled', async (event, enabled) => {
  assertTrustedSender(event);
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') {
    throw new Error('The unrestricted terminal is available only in x64 Windows and Linux desktop builds.');
  }
  if (enabled !== true) {
    unrestrictedTerminalEnabled = false;
    stopTerminalShell();
    sendTerminalState(false, '\n[Unrestricted terminal disabled.]\n');
    return false;
  }
  if (!workspaceRoot) throw new Error('Open a workspace before enabling the unrestricted terminal.');
  const consent = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Enable unrestricted terminal?',
    message: 'Terminal commands run with your account permissions and are not sandboxed.',
    detail: 'Commands can read or change files outside the workspace, access the network, install software, or start other programs. Enable only when you need this. The terminal turns off when unchecked, the workspace changes, or the app closes.',
    buttons: ['Enable terminal', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  });
  unrestrictedTerminalEnabled = consent.response === 0;
  if (!unrestrictedTerminalEnabled) {
    stopTerminalShell();
    sendTerminalState(false, '\n[Terminal enable canceled.]\n');
  } else {
    sendTerminalState(true, '\n[Unrestricted terminal enabled. Commands run with your account permissions.]\n');
  }
  return unrestrictedTerminalEnabled;
});

ipcMain.handle('terminal:write', (event, command) => {
  assertTrustedSender(event);
  if (!unrestrictedTerminalEnabled) throw new Error('Enable the unrestricted terminal checkbox first.');
  if (!workspaceRoot) throw new Error('Open a workspace before using the unrestricted terminal.');
  if (typeof command !== 'string' || !command.trim() || command.length > 8000 || /[\0\r\n]/.test(command)) {
    throw new Error('Enter a single terminal command up to 8,000 characters.');
  }
  if (!terminalShell) startTerminalShell();
  if (!terminalShell || terminalShell.stdin.destroyed || !terminalShell.stdin.writable) {
    throw new Error('The terminal shell is not available.');
  }
  if (terminalShell.stdin.writableLength > 64 * 1024) throw new Error('Terminal input is busy; wait for it to catch up.');
  terminalShell.stdin.write(`${command}\n`);
  return true;
});

function startTerminalShell() {
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
  const shellName = path.basename(shell).toLowerCase();
  const args = isWindows ? ['/Q'] : shellName.includes('bash') ? ['--noprofile', '--norc', '-i'] : ['-i'];
  const child = spawn(shell, args, {
    cwd: workspaceRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    detached: !isWindows,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  terminalShell = child;
  terminalOutputLength = 0;
  const publishOutput = (chunk) => {
    if (terminalShell !== child || terminalOutputLength >= MAX_PROCESS_OUTPUT_LENGTH) return;
    const text = chunk.toString('utf8').slice(0, MAX_PROCESS_OUTPUT_LENGTH - terminalOutputLength);
    terminalOutputLength += Buffer.byteLength(text, 'utf8');
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('terminal:shell-output', { text });
    }
    if (terminalOutputLength >= MAX_PROCESS_OUTPUT_LENGTH) {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('terminal:shell-output', { text: '\n[Terminal output limit reached; shell stopped.]\n' });
      }
      stopTerminalShell();
    }
  };
  child.stdout.on('data', publishOutput);
  child.stderr.on('data', publishOutput);
  child.on('error', (error) => {
    if (terminalShell === child && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('terminal:shell-output', { text: `\nCould not start shell: ${error.message}\n` });
    }
  });
  child.on('close', (code, signal) => {
    if (terminalShell !== child) return;
    terminalShell = null;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('terminal:shell-output', {
        text: `\n[Terminal shell closed${signal ? ` (${signal})` : `, exit code ${code}`}]\n`
      });
    }
  });
}

function sendTerminalState(enabled, text) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('terminal:shell-output', { enabled, text });
  }
}

function stopTerminalShell() {
  const child = terminalShell;
  terminalShell = null;
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = spawn(taskkill, ['/pid', String(child.pid), '/t', '/f'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore'
    });
    killer.on('error', () => child.kill());
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
      const forceKill = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }, 1000);
      forceKill.unref();
    } catch {
      child.kill('SIGTERM');
    }
  }
}

ipcMain.handle('decompiler:run', async (event, request) => {
  assertTrustedSender(event);
  if (decompilationActive) throw new Error('A decompilation is already running.');
  if (!workspaceRoot) throw new Error('Open a desktop workspace before decompiling a file.');
  if (!request || typeof request.file !== 'string' || request.file.length > 1024) {
    throw new Error('Select a valid workspace file to decompile.');
  }
  const selectedWorkspaceRoot = workspaceRoot;
  decompilationActive = true;
  try {
    const consent = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Download and decompile?',
      message: `Decompile ${path.basename(request.file)}?`,
      detail: 'If needed, the app will download official pinned tools and runtimes and verify their SHA-256 before installing them locally. Ghidra and its JDK may use about 2 GB. The selected file will be analyzed, never run, and nothing will be sent to your configured AI endpoint.',
      buttons: ['Download and decompile', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    });
    if (consent.response !== 0) return { cancelled: true };
    return await decompiler.decompile(request, selectedWorkspaceRoot, app.getPath('userData'), mainWindow);
  } finally {
    decompilationActive = false;
  }
});

function getMainWindowDisplayInfo() {
  if (!mainWindow || mainWindow.isDestroyed()) return { external: false };
  const displays = screen.getAllDisplays();
  const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  const primaryDisplay = screen.getPrimaryDisplay();
  return { external: displays.length > 1 && currentDisplay.id !== primaryDisplay.id };
}

function validateAiEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid AI endpoint URL.');
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Enter a valid AI endpoint URL.');
  }
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
    throw new Error('Endpoint URLs cannot contain credentials, query strings, or fragments.');
  }
  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost' || net.isIP(hostname) === 4 && hostname.startsWith('127.') || hostname === '::1';
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS for remote providers, or HTTP only for a local loopback model server.');
  }
  return endpoint.toString();
}

function notifyDisplayInfo() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('display:info-changed', getMainWindowDisplayInfo());
  }
}

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
  trustedAppUrl = appUrl;
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const audioOnly = details?.mediaTypes?.includes('audio') && !details.mediaTypes.includes('video');
    if (webContents !== mainWindow.webContents || webContents.getURL() !== appUrl || permission !== 'media' || !audioOnly) {
      callback(false);
      return;
    }
    if (microphoneAllowedForSession) {
      callback(true);
      return;
    }
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Microphone access',
      message: 'Allow Nightmare Code to use the microphone for voice input?',
      buttons: ['Allow while open', 'Deny'],
      defaultId: 1,
      cancelId: 1
    }).then(({ response }) => {
      microphoneAllowedForSession = response === 0;
      callback(microphoneAllowedForSession);
    }).catch(() => callback(false));
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appUrl) event.preventDefault();
  });
  mainWindow.on('move', notifyDisplayInfo);
  mainWindow.on('resize', notifyDisplayInfo);
  mainWindow.webContents.on('did-finish-load', notifyDisplayInfo);
  screen.on('display-added', notifyDisplayInfo);
  screen.on('display-removed', notifyDisplayInfo);
  screen.on('display-metrics-changed', notifyDisplayInfo);
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

app.on('before-quit', () => {
  unrestrictedTerminalEnabled = false;
  stopTerminalShell();
  for (const child of activeProcesses.values()) child.kill();
  activeProcesses.clear();
  decompiler.stopAll();
});
