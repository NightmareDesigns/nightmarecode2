const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PACKAGE_VERSION = '2.6.1';
const MODEL_ID = 'moondream/parakeet-redux';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const PROCESS_TIMEOUT = 30 * 60 * 1000;
const activeProcesses = new Set();

function pythonEnvironment(userDataPath) {
  const directory = path.join(userDataPath, `parakeet-python-${PACKAGE_VERSION}`);
  return {
    directory,
    executable: process.platform === 'win32'
      ? path.join(directory, 'Scripts', 'python.exe')
      : path.join(directory, 'bin', 'python')
  };
}

function run(executable, args, timeout = PROCESS_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeProcesses.add(child);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(child);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Local transcription setup or processing timed out.'));
    }, timeout);
    const collect = (target, chunk) => {
      if (target === 'stdout') stdout += chunk.toString();
      else stderr += chunk.toString();
      if (stdout.length + stderr.length > 1024 * 1024) {
        child.kill();
        finish(new Error('Local transcription process produced too much output.'));
      }
    };
    child.stdout.on('data', (chunk) => collect('stdout', chunk));
    child.stderr.on('data', (chunk) => collect('stderr', chunk));
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish(null, { stdout, stderr });
      else finish(new Error(stderr.trim().slice(-4000) || `Python exited with code ${code}.`));
    });
  });
}

async function findPython() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];
  for (const [executable, prefix] of candidates) {
    try {
      const { stdout } = await run(executable, [
        ...prefix,
        '-c',
        'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
      ], 10000);
      const [major, minor] = stdout.trim().split('.').map(Number);
      if (major === 3 && minor >= 10) return { executable, prefix };
    } catch {}
  }
  throw new Error('Python 3.10 or newer is required for local Parakeet dictation. Install Python, then try again.');
}

async function isInstalled(executable) {
  try {
    await run(executable, [
      '-c',
      `import importlib.metadata; assert importlib.metadata.version("moondream") == "${PACKAGE_VERSION}"`
    ], 30000);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntime(userDataPath, reportProgress = () => {}) {
  const environment = pythonEnvironment(userDataPath);
  if (await isInstalled(environment.executable)) return environment.executable;

  await fs.rm(environment.directory, { recursive: true, force: true });
  const systemPython = await findPython();
  await fs.mkdir(path.dirname(environment.directory), { recursive: true });
  reportProgress('Creating the app-local Python environment…');
  try {
    await run(systemPython.executable, [...systemPython.prefix, '-m', 'venv', environment.directory]);
    reportProgress(`Installing moondream ${PACKAGE_VERSION} and its Python dependencies…`);
    await run(environment.executable, [
      '-m', 'pip', 'install', '--disable-pip-version-check', `moondream==${PACKAGE_VERSION}`
    ]);
    return environment.executable;
  } catch (error) {
    await fs.rm(environment.directory, { recursive: true, force: true });
    throw new Error(`Could not set up local Parakeet dictation: ${error.message}`);
  }
}

async function prepare(userDataPath, reportProgress) {
  const executable = await ensureRuntime(userDataPath, reportProgress);
  if (!await isInstalled(executable)) throw new Error('The local Parakeet Python package could not be loaded.');
  return true;
}

async function transcribe(userDataPath, audio, mimeType, reportProgress = () => {}) {
  if (!Buffer.isBuffer(audio) || audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    throw new Error('Recording is empty or exceeds the 25 MB limit.');
  }
  const extensions = new Map([
    ['audio/webm', '.webm'],
    ['audio/ogg', '.ogg'],
    ['audio/mp4', '.mp4'],
    ['audio/wav', '.wav'],
    ['audio/mpeg', '.mp3']
  ]);
  const extension = extensions.get(mimeType);
  if (!extension) throw new Error('This recording format is not supported for local transcription.');

  const executable = await ensureRuntime(userDataPath, reportProgress);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'nightmare-parakeet-'));
  const audioPath = path.join(temporaryDirectory, `recording${extension}`);
  try {
    await fs.writeFile(audioPath, audio, { flag: 'wx', mode: 0o600 });
    reportProgress('Transcribing locally with Parakeet Redux…');
    const script = [
      'import json, moondream',
      `with moondream.photon(${JSON.stringify(MODEL_ID)}) as model:`,
      `    result = model.transcribe(audio=${JSON.stringify(audioPath)})`,
      'print(json.dumps({"text": result.get("text", "")}))'
    ].join('\n');
    const { stdout } = await run(executable, ['-c', script]);
    const output = stdout.trim().split(/\r?\n/).reverse().find((line) => line.startsWith('{"text"'));
    if (!output) throw new Error('Local transcription returned no transcript.');
    const result = JSON.parse(output);
    if (typeof result.text !== 'string') throw new Error('Local transcription returned an invalid transcript.');
    return result.text.trim();
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function stopAll() {
  for (const child of activeProcesses) child.kill();
  activeProcesses.clear();
}

module.exports = { MAX_AUDIO_BYTES, prepare, transcribe, stopAll };
