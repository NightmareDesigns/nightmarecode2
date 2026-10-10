const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { constants: fsConstants } = require('fs');
const { spawn } = require('child_process');
const { createHash } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { createGunzip, createInflateRaw } = require('zlib');

const MAX_INPUT_SIZE = 64 * 1024 * 1024;
const MAX_DOWNLOAD_SIZE = 1800 * 1024 * 1024;
const MAX_EXTRACTED_SIZE = 3 * 1024 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 2 * 1024 * 1024;
const PROCESS_TIMEOUT = 15 * 60 * 1000;
const MAX_ARCHIVE_ENTRIES = 100000;
const CACHE_ROOT_NAME = 'decompiler-tools-v1';
const activeToolProcesses = new Set();

const JAVA_VERSION = '21.0.12.1+1';
const DOTNET_VERSION = '10.0.12';
const TOOLS = {
  ghidra: {
    version: '12.1.4',
    maxBytes: 1500 * 1024 * 1024,
    url: 'https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip',
    sha256: 'ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db',
    archive: 'zip'
  },
  cfr: {
    version: '0.152',
    maxBytes: 20 * 1024 * 1024,
    url: 'https://repo.maven.apache.org/maven2/org/benf/cfr/0.152/cfr-0.152.jar',
    sha256: 'f686e8f3ded377d7bc87d216a90e9e9512df4156e75b06c655a16648ae8765b2',
    archive: 'file'
  },
  wabt: {
    version: '1.0.42',
    maxBytes: 100 * 1024 * 1024,
    archive: 'tar.gz',
    assets: {
      linux: {
        url: 'https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42-linux-x64.tar.gz',
        sha256: '84895407a6bbb80e918f33b16b2fb2206021c150b6bc9ff6f761263a745ab131'
      },
      win32: {
        url: 'https://github.com/WebAssembly/wabt/releases/download/1.0.42/wabt-1.0.42-windows-x64.tar.gz',
        sha256: '62f1eb2b51aa57cf0f0b8ba333bf2c72a049930aa9c5de01dcad271c4fe48c88'
      }
    }
  }
};

function javaAsset(platform) {
  const isWindows = platform === 'win32';
  return {
    version: JAVA_VERSION,
    maxBytes: 450 * 1024 * 1024,
    archive: isWindows ? 'zip' : 'tar.gz',
    url: isWindows
      ? 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip'
      : 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz',
    sha256: isWindows
      ? 'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'
      : 'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94'
  };
}

function ilspyAsset(platform) {
  const isWindows = platform === 'win32';
  return {
    version: '11.1.0.9782',
    maxBytes: 150 * 1024 * 1024,
    archive: 'zip',
    url: isWindows
      ? 'https://github.com/icsharpcode/ILSpy/releases/download/v11.1/ILSpy_windows_11.1.0.9782-x64.zip'
      : 'https://github.com/icsharpcode/ILSpy/releases/download/v11.1/ILSpy_linux-x64_11.1.0.9782.zip',
    sha256: isWindows
      ? '37a9a19220f7621d9bc7ad9a00ed6f98e6a7a90f582165e52170e90b1b22138a'
      : '96f8b38cdf901b0546b258e38be3a0a65cb7cdb98e62bdd9c48088c4dce9321b'
  };
}

function dotnetAsset(platform) {
  const isWindows = platform === 'win32';
  return {
    version: DOTNET_VERSION,
    maxBytes: 50 * 1024 * 1024,
    archive: isWindows ? 'zip' : 'tar.gz',
    url: isWindows
      ? 'https://dotnetcli.azureedge.net/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-win-x64.zip'
      : 'https://dotnetcli.azureedge.net/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-linux-x64.tar.gz',
    sha256: isWindows
      ? 'da3947e6acbb5228e4e987c7585aa40ce2d7000856e3da0804e6ee3771e806dc'
      : '8458f4cef855fcebd139d9853e47fb0a5d86ab65d4aa101ea158a11e036c0fa4'
  };
}

function assertSupportedPlatform(platform = process.platform) {
  if (!['win32', 'linux'].includes(platform) || process.arch !== 'x64') {
    throw new Error('Decompilation tools are available only in x64 Windows and Linux desktop builds. Android and other architectures are not supported.');
  }
}

function ensureSafeArchivePath(root, name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
    throw new Error('The downloaded tool archive contains an unsafe path.');
  }
  const parts = name.replace(/\/+$/, '').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f]/.test(part) ||
      process.platform === 'win32' && (/[<>:"|?*]/.test(part) || /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))) {
    throw new Error('The downloaded tool archive contains an unsafe path.');
  }
  const result = path.resolve(root, ...parts);
  const relative = path.relative(root, result);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('The downloaded tool archive contains an unsafe path.');
  }
  return { result, directory: name.endsWith('/') };
}

async function ensureParents(root, output) {
  const relative = path.relative(root, path.dirname(output));
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const info = await fsp.lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe directory in tool archive.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsp.mkdir(current);
    }
  }
}

function makeCrc32() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  let crc = 0xffffffff;
  return {
    update(buffer) {
      for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    },
    digest() { return (crc ^ 0xffffffff) >>> 0; }
  };
}

async function readAt(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

async function extractZip(archivePath, destination, report) {
  const deadline = Date.now() + 60 * 60 * 1000;
  const handle = await fsp.open(archivePath, 'r');
  try {
    const { size } = await handle.stat();
    const tailSize = Math.min(size, 22 + 0xffff);
    const tail = await readAt(handle, tailSize, size - tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0 || eocd + 22 > tail.length) throw new Error('Invalid ZIP tool archive.');
    if (tail.readUInt16LE(eocd + 4) !== 0 || tail.readUInt16LE(eocd + 6) !== 0 ||
        tail.readUInt16LE(eocd + 8) !== tail.readUInt16LE(eocd + 10)) {
      throw new Error('Multi-volume ZIP archives are not supported.');
    }
    const count = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (count > MAX_ARCHIVE_ENTRIES || centralSize > 64 * 1024 * 1024 ||
        centralOffset + centralSize > size || count === 0xffff || centralOffset === 0xffffffff) {
      throw new Error('ZIP archive exceeds safe extraction limits or uses unsupported ZIP64 format.');
    }
    const central = await readAt(handle, centralSize, centralOffset);
    const entries = [];
    let offset = 0;
    let extractedTotal = 0;
    const seen = new Set();
    for (let index = 0; index < count; index++) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error('Invalid ZIP directory.');
      }
      const flags = central.readUInt16LE(offset + 8);
      const method = central.readUInt16LE(offset + 10);
      const crc = central.readUInt32LE(offset + 16);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const nameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const externalAttributes = central.readUInt32LE(offset + 38);
      const localOffset = central.readUInt32LE(offset + 42);
      const startDisk = central.readUInt16LE(offset + 34);
      if (offset + 46 + nameLength + extraLength + commentLength > central.length ||
          flags & 1 || ![0, 8].includes(method) || compressedSize === 0xffffffff ||
          uncompressedSize === 0xffffffff || localOffset === 0xffffffff || startDisk !== 0) {
        throw new Error('ZIP archive uses an unsupported or unsafe entry.');
      }
      const name = central.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      const safe = ensureSafeArchivePath(destination, name);
      const unixType = (externalAttributes >>> 16) & 0xf000;
      if (unixType === 0xa000 || (unixType && unixType !== 0x8000 && unixType !== 0x4000)) {
        throw new Error('Symbolic links and special files are not allowed in tool archives.');
      }
      if (unixType === 0x4000 && !safe.directory) throw new Error('Invalid ZIP directory entry.');
      if (seen.has(safe.result)) throw new Error('Tool archive contains duplicate paths.');
      seen.add(safe.result);
      extractedTotal += uncompressedSize;
      if (extractedTotal > MAX_EXTRACTED_SIZE || uncompressedSize > MAX_EXTRACTED_SIZE) {
        throw new Error('Tool archive exceeds safe extraction limits.');
      }
      entries.push({ ...safe, name, method, crc, compressedSize, uncompressedSize, localOffset, externalAttributes });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset !== central.length) throw new Error('Invalid ZIP directory size.');
    let completed = 0;
    for (const entry of entries) {
      if (Date.now() > deadline) throw new Error('Tool archive extraction exceeded the one-hour time limit.');
      if (entry.directory) {
        await ensureParents(destination, entry.result);
        await fsp.mkdir(entry.result, { recursive: true });
        continue;
      }
      await ensureParents(destination, entry.result);
      if (entry.compressedSize === 0 && entry.uncompressedSize === 0) {
        const emptyFile = await fsp.open(entry.result, 'wx', 0o644);
        await emptyFile.close();
        if (entry.crc !== 0) throw new Error('ZIP entry integrity check failed.');
        completed++;
        continue;
      }
      if (entry.compressedSize === 0) throw new Error('Invalid empty ZIP entry.');
      const local = await readAt(handle, 30, entry.localOffset);
      if (local.length !== 30 || local.readUInt32LE(0) !== 0x04034b50 ||
          local.readUInt16LE(6) & 1 || local.readUInt16LE(8) !== entry.method) {
        throw new Error('Invalid ZIP file entry.');
      }
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      const localName = await readAt(handle, localNameLength, entry.localOffset + 30);
      if (localName.toString('utf8') !== entry.name) throw new Error('Mismatched ZIP entry name.');
      const start = entry.localOffset + 30 + localNameLength + localExtraLength;
      const end = start + entry.compressedSize - 1;
      if (end >= size) throw new Error('Invalid ZIP entry data range.');
      const crc = makeCrc32();
      let bytes = 0;
      const verifier = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > entry.uncompressedSize) return callback(new Error('ZIP entry expanded beyond its declared size.'));
          crc.update(chunk);
          callback(null, chunk);
        }
      });
      const source = fs.createReadStream(archivePath, { start, end });
      const decoder = entry.method === 8 ? createInflateRaw() : new Transform({ transform(chunk, _encoding, cb) { cb(null, chunk); } });
      const mode = ((entry.externalAttributes >>> 16) & 0o777) || 0o644;
      const target = fs.createWriteStream(entry.result, { flags: 'wx', mode: mode & 0o755 });
      await pipeline(source, decoder, verifier, target, { signal: AbortSignal.timeout(60 * 60 * 1000) });
      if (bytes !== entry.uncompressedSize || crc.digest() !== entry.crc) throw new Error('ZIP entry integrity check failed.');
      completed++;
      report?.(`Extracted ${completed} of ${entries.length} files`);
    }
  } finally {
    await handle.close();
  }
}

class StreamReader {
  constructor(stream) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
  }

  async read(length) {
    const pieces = [];
    let remaining = length;
    while (remaining > 0) {
      if (this.buffer.length === 0) {
        const next = await this.iterator.next();
        if (next.done) throw new Error('Truncated TAR tool archive.');
        this.buffer = Buffer.from(next.value);
      }
      const take = Math.min(remaining, this.buffer.length);
      pieces.push(this.buffer.subarray(0, take));
      this.buffer = this.buffer.subarray(take);
      remaining -= take;
    }
    return Buffer.concat(pieces, length);
  }

  async copyToFile(filePath, size) {
    const output = await fsp.open(filePath, 'wx', 0o644);
    try {
      let remaining = size;
      while (remaining > 0) {
        if (!this.buffer.length) {
          const next = await this.iterator.next();
          if (next.done) throw new Error('Truncated TAR file.');
          this.buffer = Buffer.from(next.value);
        }
        const take = Math.min(remaining, this.buffer.length);
        let written = 0;
        while (written < take) {
          const result = await output.write(this.buffer, written, take - written, null);
          if (!result.bytesWritten) throw new Error('Could not write an extracted tool file.');
          written += result.bytesWritten;
        }
        this.buffer = this.buffer.subarray(take);
        remaining -= take;
      }
    } finally {
      await output.close();
    }
  }

  async skip(length) {
    while (length > 0) {
      if (!this.buffer.length) {
        const next = await this.iterator.next();
        if (next.done) throw new Error('Truncated TAR padding.');
        this.buffer = Buffer.from(next.value);
      }
      const take = Math.min(length, this.buffer.length);
      this.buffer = this.buffer.subarray(take);
      length -= take;
    }
  }
}

function tarString(header, start, length) {
  const end = header.indexOf(0, start);
  return header.subarray(start, end < 0 || end > start + length ? start + length : end).toString('utf8');
}

function tarNumber(header, start, length) {
  const text = header.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
  if (!/^[0-7]*$/.test(text)) throw new Error('Unsupported TAR numeric field.');
  return text ? Number.parseInt(text, 8) : 0;
}

async function extractTarGz(archivePath, destination, report) {
  const deadline = Date.now() + 60 * 60 * 1000;
  const source = fs.createReadStream(archivePath, { signal: AbortSignal.timeout(60 * 60 * 1000) });
  const reader = new StreamReader(source.pipe(createGunzip()));
  let entries = 0;
  let expanded = 0;
  while (true) {
    if (Date.now() > deadline) throw new Error('Tool archive extraction exceeded the one-hour time limit.');
    const header = await reader.read(512);
    if (header.every((byte) => byte === 0)) break;
    entries++;
    if (entries > MAX_ARCHIVE_ENTRIES) throw new Error('TAR archive has too many entries.');
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const rawName = prefix ? `${prefix}/${name}` : name;
    const size = tarNumber(header, 124, 12);
    const mode = tarNumber(header, 100, 8);
    const type = String.fromCharCode(header[156] || 48);
    const checksum = tarNumber(header, 148, 8);
    let computedChecksum = 0;
    for (let index = 0; index < header.length; index++) {
      computedChecksum += index >= 148 && index < 156 ? 32 : header[index];
    }
    if (checksum !== computedChecksum) throw new Error('TAR archive header integrity check failed.');
    if ((rawName === '.' || rawName === './' || rawName === '') && type === '5') {
      if (size) await reader.skip(size);
      const padding = (512 - (size % 512)) % 512;
      if (padding) await reader.skip(padding);
      continue;
    }
    const fullName = rawName.replace(/^\.\//, '');
    const safeName = type === '5' && !fullName.endsWith('/') ? `${fullName}/` : fullName;
    const safe = ensureSafeArchivePath(destination, safeName);
    expanded += size;
    if (size > MAX_EXTRACTED_SIZE || expanded > MAX_EXTRACTED_SIZE) throw new Error('TAR archive exceeds safe extraction limits.');
    if (type === '5') {
      await fsp.mkdir(safe.result, { recursive: true });
    } else if (type === '0' || type === '\0') {
      await ensureParents(destination, safe.result);
      await reader.copyToFile(safe.result, size);
      await fsp.chmod(safe.result, mode & 0o755);
      report?.(`Extracted ${entries} archive entries`);
    } else if (type === '2') {
      const link = tarString(header, 157, 100);
      if (!link || path.isAbsolute(link) || link.includes('\\')) throw new Error('Unsafe symbolic link in tool archive.');
      await ensureParents(destination, safe.result);
      const linkTarget = path.resolve(path.dirname(safe.result), link);
      const relative = path.relative(destination, linkTarget);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Symbolic link escapes the tool installation directory.');
      }
      await fsp.symlink(link, safe.result);
    } else {
      throw new Error('Tool archive contains an unsupported special entry.');
    }
    const padding = (512 - (size % 512)) % 512;
    if (type !== '0' && type !== '\0') await reader.skip(size);
    if (padding) await reader.skip(padding);
  }
}

function sendProgress(window, detail) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send('decompiler:progress', detail);
  }
}

async function downloadAsset(asset, targetPath, window, label) {
  sendProgress(window, { status: `Downloading ${label}…`, tool: label });
  const response = await fetch(asset.url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(45 * 60 * 1000),
    headers: { 'User-Agent': 'NightmareCode-decompiler/1.0' }
  });
  if (!response.ok || !response.body) throw new Error(`${label} download failed (HTTP ${response.status}).`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > asset.maxBytes) throw new Error(`${label} download exceeds the size limit.`);
  const hash = createHash('sha256');
  let received = 0;
  let lastProgressAt = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > asset.maxBytes || received > MAX_DOWNLOAD_SIZE) return callback(new Error(`${label} download exceeded the size limit.`));
      hash.update(chunk);
      if (Date.now() - lastProgressAt > 750) {
        lastProgressAt = Date.now();
        sendProgress(window, { status: `Downloading ${label}: ${Math.floor(received / 1024 / 1024)} MB`, tool: label });
      }
      callback(null, chunk);
    }
  });
  await pipeline(response.body, progress, fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }));
  const digest = hash.digest('hex');
  if (digest !== asset.sha256) {
    await fsp.rm(targetPath, { force: true });
    throw new Error(`${label} download failed SHA-256 verification.`);
  }
}

async function installAsset(asset, installPath, label, window) {
  const parent = path.dirname(installPath);
  await fsp.mkdir(parent, { recursive: true, mode: 0o700 });
  const existing = await fsp.lstat(installPath).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error(`Unsafe cached ${label} installation path.`);
  if (existing?.isDirectory()) {
    try {
      const marker = await fsp.readFile(path.join(installPath, '.verified-sha256'), 'utf8');
      if (marker.trim() === asset.sha256) return installPath;
    } catch { /* Missing or invalid marker causes a verified reinstall. */ }
  }
  const stage = `${installPath}.installing`;
  await fsp.rm(stage, { recursive: true, force: true });
  await fsp.mkdir(stage, { mode: 0o700 });
  const archivePath = path.join(stage, 'download.asset');
  try {
    await downloadAsset(asset, archivePath, window, label);
    if (asset.archive === 'file') {
      const outputPath = path.join(stage, 'installed', 'cfr.jar');
      await fsp.mkdir(path.dirname(outputPath));
      await fsp.rename(archivePath, outputPath);
    } else {
      const extractPath = path.join(stage, 'extracted');
      await fsp.mkdir(extractPath, { mode: 0o700 });
      sendProgress(window, { status: `Verifying and extracting ${label}…`, tool: label });
      let lastExtractionUpdate = 0;
      const extractionProgress = (status) => {
        if (Date.now() - lastExtractionUpdate > 1000) {
          lastExtractionUpdate = Date.now();
          sendProgress(window, { status: `${label}: ${status}`, tool: label });
        }
      };
      if (asset.archive === 'zip') await extractZip(archivePath, extractPath, extractionProgress);
      else if (asset.archive === 'tar.gz') await extractTarGz(archivePath, extractPath, extractionProgress);
      await fsp.rm(archivePath, { force: true });
    }
    await fsp.rm(path.join(stage, 'download.asset'), { force: true });
    await fsp.writeFile(path.join(stage, '.verified-sha256'), `${asset.sha256}\n`, { encoding: 'utf8', mode: 0o600 });
    await fsp.rm(installPath, { recursive: true, force: true });
    await fsp.rename(stage, installPath);
    return installPath;
  } catch (error) {
    await fsp.rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function findFile(root, names, maxDepth = 8) {
  async function visit(directory, depth) {
    if (depth > maxDepth) return null;
    let entries;
    try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && names.includes(entry.name)) return candidate;
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        const found = await visit(candidate, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return visit(root, 0);
}

async function validateWorkspaceInput(relativePath, workspaceRoot) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) throw new Error('Select a workspace file to decompile.');
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid workspace path.');
  }
  const absolute = path.resolve(workspaceRoot, normalized);
  const rootInfo = await fsp.lstat(workspaceRoot);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory() || await fsp.realpath(workspaceRoot) !== workspaceRoot) {
    throw new Error('The open workspace folder is no longer available as a regular directory.');
  }
  const relative = path.relative(workspaceRoot, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('File is outside the workspace.');
  let current = workspaceRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await fsp.lstat(current);
    if (info.isSymbolicLink()) throw new Error('Symbolic links are not supported for decompilation.');
  }
  const info = await fsp.stat(absolute);
  if (!info.isFile() || info.size > MAX_INPUT_SIZE) throw new Error('Decompilation supports regular files up to 64 MB.');
  return { absolute, extension: path.extname(absolute).toLowerCase(), size: info.size };
}

async function hasValidDotNetMetadata(filePath) {
  const file = await fsp.open(filePath, 'r');
  try {
    const header = await readAt(file, 4096, 0);
    if (header.length < 64 || header.toString('ascii', 0, 2) !== 'MZ') return false;
    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset > 2048 || peOffset + 24 > header.length || header.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') return false;
    const sectionsCount = header.readUInt16LE(peOffset + 6);
    const optionalSize = header.readUInt16LE(peOffset + 20);
    const optional = peOffset + 24;
    if (sectionsCount < 1 || sectionsCount > 96 || optional + optionalSize > header.length || optionalSize < 128) return false;
    const magic = header.readUInt16LE(optional);
    const directoryOffset = magic === 0x10b ? optional + 96 : magic === 0x20b ? optional + 112 : 0;
    const directoryCountOffset = magic === 0x10b ? optional + 92 : magic === 0x20b ? optional + 108 : 0;
    if (!directoryCountOffset || header.readUInt32LE(directoryCountOffset) < 15) return false;
    const cliDirectory = directoryOffset + 14 * 8;
    if (!directoryOffset || cliDirectory + 8 > optional + optionalSize || cliDirectory + 8 > header.length) return false;
    const cliRva = header.readUInt32LE(cliDirectory);
    const cliSize = header.readUInt32LE(cliDirectory + 4);
    if (!cliRva || cliSize < 0x48) return false;

    const fileInfo = await file.stat();
    const sectionsOffset = optional + optionalSize;
    const sectionTableSize = sectionsCount * 40;
    if (sectionsOffset + sectionTableSize > fileInfo.size) return false;
    const sections = await readAt(file, sectionTableSize, sectionsOffset);
    if (sections.length !== sectionTableSize) return false;
    const findRawOffset = (rva, size) => {
      for (let index = 0; index < sectionsCount; index++) {
        const section = index * 40;
        const virtualSize = sections.readUInt32LE(section + 8);
        const virtualAddress = sections.readUInt32LE(section + 12);
        const rawSize = sections.readUInt32LE(section + 16);
        const rawOffset = sections.readUInt32LE(section + 20);
        const delta = rva - virtualAddress;
        if (delta >= 0 && delta + size <= rawSize && delta < Math.max(virtualSize, rawSize) &&
            rawOffset + delta + size <= fileInfo.size) return rawOffset + delta;
      }
      return null;
    };
    const cliOffset = findRawOffset(cliRva, 0x48);
    if (cliOffset === null) return false;
    const cliHeader = await readAt(file, 0x48, cliOffset);
    if (cliHeader.length !== 0x48 || cliHeader.readUInt32LE(0) < 0x48 ||
        cliHeader.readUInt32LE(0) > cliSize) return false;
    const metadataRva = cliHeader.readUInt32LE(8);
    const metadataSize = cliHeader.readUInt32LE(12);
    if (!metadataRva || metadataSize < 16) return false;
    const metadataOffset = findRawOffset(metadataRva, 16);
    if (metadataOffset === null) return false;
    const metadataHeader = await readAt(file, 16, metadataOffset);
    if (metadataHeader.length !== 16 || metadataHeader.readUInt32LE(0) !== 0x424a5342) return false;
    const versionLength = metadataHeader.readUInt32LE(12);
    return versionLength > 0 && versionLength <= metadataSize - 16;
  } finally {
    await file.close();
  }
}

async function copyWorkspaceInput(source, destination, expectedSize) {
  const noFollow = fsConstants.O_NOFOLLOW || 0;
  const input = await fsp.open(source, fsConstants.O_RDONLY | noFollow);
  try {
    const [openedInfo, pathInfo] = await Promise.all([input.stat(), fsp.lstat(source)]);
    if (pathInfo.isSymbolicLink() || !openedInfo.isFile() || openedInfo.size !== expectedSize ||
        openedInfo.dev !== pathInfo.dev || openedInfo.ino !== pathInfo.ino) {
      throw new Error('The workspace file changed while it was being opened.');
    }
    const output = await fsp.open(destination, 'wx', 0o600);
    try {
      const stream = input.createReadStream({ autoClose: false });
      let copied = 0;
      const cap = new Transform({
        transform(chunk, _encoding, callback) {
          copied += chunk.length;
          if (copied > MAX_INPUT_SIZE) return callback(new Error('Input exceeds the 64 MB limit.'));
          callback(null, chunk);
        }
      });
      await pipeline(stream, cap, output.createWriteStream({ autoClose: false }));
      const finalInfo = await input.stat();
      if (copied !== expectedSize || finalInfo.size !== openedInfo.size ||
          finalInfo.mtimeMs !== openedInfo.mtimeMs || finalInfo.ctimeMs !== openedInfo.ctimeMs) {
        throw new Error('The workspace file changed while it was being copied.');
      }
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}

function runProcess(command, args, options, window, label) {
  return new Promise((resolve, reject) => {
    const { monitorDirectory, maxDiskOutput, ...spawnOptions } = options;
    const outputChunks = [];
    let outputBytes = 0;
    let outputTruncated = false;
    let lastOutputProgressAt = 0;
    let error = '';
    let timedOut = false;
    let limitExceeded = false;
    let checkingOutput = false;
    let settled = false;
    const child = spawn(command, args, {
      ...spawnOptions,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeToolProcesses.add(child);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(outputMonitor);
      callback(value);
    };
    const collect = (isError) => (chunk) => {
      if (isError) {
        if (error.length < 12000) error += chunk.toString('utf8').slice(0, 12000 - error.length);
      } else if (outputBytes < MAX_OUTPUT_SIZE) {
        const kept = chunk.subarray(0, MAX_OUTPUT_SIZE - outputBytes);
        outputChunks.push(kept);
        outputBytes += kept.length;
        if (kept.length < chunk.length) outputTruncated = true;
        if (Date.now() - lastOutputProgressAt > 750) {
          lastOutputProgressAt = Date.now();
          sendProgress(window, { status: `Decompiling ${label}: ${Math.floor(outputBytes / 1024)} KB output`, tool: label });
        }
      } else {
        outputTruncated = true;
      }
    };
    child.stdout.on('data', collect(false));
    child.stderr.on('data', collect(true));
    child.on('error', (cause) => {
      activeToolProcesses.delete(child);
      finish(reject, new Error(`Could not start ${label}: ${cause.message}`));
    });
    child.on('close', (code, signal) => {
      activeToolProcesses.delete(child);
      if (limitExceeded) finish(reject, new Error(`${label} exceeded its output disk limit.`));
      else if (timedOut) finish(reject, new Error(`${label} exceeded the 15-minute time limit.`));
      else if (signal) finish(reject, new Error(`${label} was stopped (${signal}).`));
      else if (code !== 0) finish(reject, new Error(`${label} exited with code ${code}: ${error.slice(-3000) || 'No diagnostic output.'}`));
      else finish(resolve, Buffer.concat(outputChunks).toString('utf8') + (outputTruncated ? '\n\n// Output truncated at the 2 MB limit.' : ''));
    });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, PROCESS_TIMEOUT);
    const outputMonitor = monitorDirectory
      ? setInterval(async () => {
          if (checkingOutput || settled) return;
          checkingOutput = true;
          try {
            await measureDirectory(monitorDirectory, maxDiskOutput || MAX_OUTPUT_SIZE, 1000);
          } catch {
            limitExceeded = true;
            terminateProcessTree(child);
          } finally {
            checkingOutput = false;
          }
        }, 100)
      : null;
  });
}

function terminateProcessTree(child) {
  try {
    if (process.platform === 'win32') {
      const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
      const killer = spawn(taskkill, ['/pid', String(child.pid), '/t', '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill('SIGKILL'));
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

function stopAll() {
  for (const child of activeToolProcesses) terminateProcessTree(child);
  activeToolProcesses.clear();
}

async function collectFiles(directory, maxFiles = 100) {
  const files = [];
  async function visit(current, prefix = '') {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      if (files.length >= maxFiles) throw new Error('Decompiler produced too many output files.');
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Decompiler produced an unsafe symbolic link.');
      if (entry.isDirectory()) await visit(absolute, prefix ? `${prefix}/${entry.name}` : entry.name);
      else if (entry.isFile()) files.push({ absolute, name: prefix ? `${prefix}/${entry.name}` : entry.name });
    }
  }
  await visit(directory);
  return files;
}

async function measureDirectory(root, maxBytes, maxFiles = MAX_ARCHIVE_ENTRIES) {
  try {
    const rootInfo = await fsp.lstat(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('Decompiler output path is not a safe directory.');
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  let total = 0;
  let files = 0;
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const info = await fsp.lstat(absolute);
      if (info.isSymbolicLink()) throw new Error('Decompiler created an unsafe symbolic link.');
      if (info.isDirectory()) await visit(absolute);
      else if (info.isFile()) {
        files++;
        total += info.size;
        if (files > maxFiles || total > maxBytes) throw new Error('Decompiler output exceeded its disk usage limit.');
      }
    }
  }
  await visit(root);
  return total;
}

async function readDecompilerOutput(file) {
  const outputFiles = await collectFiles(file);
  const chunks = [];
  let total = 0;
  for (const entry of outputFiles) {
    const stats = await fsp.stat(entry.absolute);
    if (!stats.isFile() || stats.size > MAX_OUTPUT_SIZE || total + stats.size > MAX_OUTPUT_SIZE) {
      throw new Error('Decompiler output exceeded the 2 MB limit.');
    }
    total += stats.size;
    chunks.push(`// ${entry.name}\n${await fsp.readFile(entry.absolute, 'utf8')}`);
  }
  return chunks.join('\n\n');
}

function capOutput(text) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= MAX_OUTPUT_SIZE) return text;
  const marker = Buffer.from('\n// Output truncated at the 2 MB limit.', 'utf8');
  return `${bytes.subarray(0, MAX_OUTPUT_SIZE - marker.length).toString('utf8')}${marker.toString('utf8')}`;
}

async function makeToolEnv(work, extra = {}) {
  await fsp.mkdir(path.join(work, 'tmp'), { recursive: true, mode: 0o700 });
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return {
    PATH: process.platform === 'win32' ? path.join(systemRoot, 'System32') : '/usr/bin:/bin',
    SystemRoot: process.platform === 'win32' ? systemRoot : '',
    HOME: work,
    USERPROFILE: work,
    TEMP: path.join(work, 'tmp'),
    TMP: path.join(work, 'tmp'),
    TMPDIR: path.join(work, 'tmp'),
    ...extra
  };
}

function ghidraScriptText() {
  return `// Decompiles functions into stdout. Input files are analyzed, never executed.
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.program.model.listing.Function;
import ghidra.util.task.ConsoleTaskMonitor;
import java.util.Iterator;

public class NightmareExport extends ghidra.app.script.GhidraScript {
  public void run() throws Exception {
    DecompInterface decompiler = new DecompInterface();
    decompiler.setOptions(new DecompileOptions());
    decompiler.openProgram(currentProgram);
    Iterator<Function> functions = currentProgram.getFunctionManager().getFunctions(true).iterator();
    int count = 0;
    while (functions.hasNext() && count < 500) {
      Function function = functions.next();
      if (function.isExternal()) continue;
      println("\\n// Function " + function.getName() + " at " + function.getEntryPoint());
      ghidra.app.decompiler.DecompileResults result = decompiler.decompileFunction(function, 30, new ConsoleTaskMonitor());
      if (result.decompileCompleted()) println(result.getDecompiledFunction().getC());
      else println("// Decompilation failed: " + result.getErrorMessage());
      count++;
    }
    if (functions.hasNext()) println("\\n// Output limited to 500 functions.");
    decompiler.dispose();
  }
}`;
}

async function ensureCacheRoot(userDataPath) {
  await fsp.mkdir(userDataPath, { recursive: true, mode: 0o700 });
  const cache = path.join(userDataPath, CACHE_ROOT_NAME);
  let info = await fsp.lstat(cache).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info) {
    await fsp.mkdir(cache, { mode: 0o700 });
    info = await fsp.lstat(cache);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe decompiler cache directory.');
  await fsp.chmod(cache, 0o700);
  return cache;
}

async function installTool(name, root, platform, window) {
  const cache = await ensureCacheRoot(root);
  const install = async (key, asset, label) => installAsset(asset, path.join(cache, key), label, window);
  const installPair = async (first, second) => {
    const results = await Promise.allSettled([first, second]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map((result) => result.value);
  };
  if (name === 'wabt') return install('wabt-1.0.42', { ...TOOLS.wabt, ...TOOLS.wabt.assets[platform] }, 'WABT wasm2wat');
  if (name === 'cfr') return install('cfr-0.152', TOOLS.cfr, 'CFR');
  if (name === 'ilspy') {
    const [ilspy, dotnet] = await installPair(
      install('ilspy-11.1', ilspyAsset(platform), 'ILSpy command-line'),
      install('dotnet-10.0.12', dotnetAsset(platform), '.NET runtime')
    );
    return { ilspy, dotnet };
  }
  if (name === 'ghidra') {
    const [ghidra, java] = await installPair(
      install('ghidra-12.1.4', TOOLS.ghidra, 'Ghidra headless'),
      install('temurin-jdk-21.0.12', javaAsset(platform), 'Temurin JDK')
    );
    return { ghidra, java };
  }
  throw new Error('Unsupported decompiler tool.');
}

async function decompile(request, workspaceRoot, appDataPath, window) {
  assertSupportedPlatform();
  if (!workspaceRoot) throw new Error('Open a desktop workspace first.');
  const input = await validateWorkspaceInput(request?.file, workspaceRoot);
  const toolName = {
    '.exe': 'ghidra',
    '.dll': 'ilspy',
    '.class': 'cfr',
    '.jar': 'cfr',
    '.wasm': 'wabt'
  }[input.extension];
  if (!toolName) throw new Error('Supported decompilation formats are .exe, .dll, .class, .jar, and .wasm.');
  const cache = await ensureCacheRoot(appDataPath);
  const jobs = path.join(cache, 'jobs');
  let jobsInfo = await fsp.lstat(jobs).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!jobsInfo) {
    await fsp.mkdir(jobs, { mode: 0o700 });
    jobsInfo = await fsp.lstat(jobs);
  }
  if (jobsInfo.isSymbolicLink() || !jobsInfo.isDirectory()) throw new Error('Unsafe decompiler job directory.');
  await fsp.chmod(jobs, 0o700);
  const work = path.join(jobs, `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fsp.mkdir(work, { mode: 0o700 });
  try {
    const safeInput = path.join(work, `selected${input.extension}`);
    await copyWorkspaceInput(input.absolute, safeInput, input.size);
    let selectedTool = toolName;
    if (['.exe', '.dll'].includes(input.extension)) {
      selectedTool = await hasValidDotNetMetadata(safeInput) ? 'ilspy' : 'ghidra';
    }
    sendProgress(window, { status: `Preparing ${selectedTool}…`, tool: selectedTool });
    const installed = await installTool(selectedTool, appDataPath, process.platform, window);
    let output = '';
    if (selectedTool === 'wabt') {
      const wasm2wat = await findFile(installed, [process.platform === 'win32' ? 'wasm2wat.exe' : 'wasm2wat']);
      if (!wasm2wat) throw new Error('WABT installation did not contain wasm2wat.');
      output = await runProcess(wasm2wat, [safeInput], {
        cwd: work,
        env: await makeToolEnv(work)
      }, window, 'WABT wasm2wat');
    } else if (selectedTool === 'cfr') {
      const jar = path.join(installed, 'installed', 'cfr.jar');
      const jdk = await installAsset(
        javaAsset(process.platform),
        path.join(cache, 'temurin-jdk-21.0.12'),
        'Temurin JDK',
        window
      );
      const java = await findFile(jdk, ['java.exe', 'java']);
      if (!java) throw new Error('The downloaded JDK did not contain Java.');
      output = await runCfr(java, jar, safeInput, work, window);
    } else if (selectedTool === 'ilspy') {
      const command = await findFile(installed.ilspy, ['ILSpyCmd.dll']);
      const dotnet = await findFile(installed.dotnet, [process.platform === 'win32' ? 'dotnet.exe' : 'dotnet']);
      if (!command || !dotnet) throw new Error('ILSpy or the bundled .NET runtime is incomplete.');
      output = await runProcess(dotnet, [command, safeInput], {
        cwd: work,
        env: await makeToolEnv(work, { DOTNET_ROOT: path.dirname(dotnet) }),
        monitorDirectory: work,
        maxDiskOutput: 512 * 1024 * 1024
      }, window, 'ILSpy');
    } else {
      const analyzeHeadless = await findFile(installed.ghidra, [process.platform === 'win32' ? 'analyzeHeadless.bat' : 'analyzeHeadless']);
      const javaHome = await findFile(installed.java, ['java.exe', 'java']);
      if (!analyzeHeadless || !javaHome) throw new Error('Ghidra headless or its JDK is incomplete.');
      const javaDir = path.dirname(path.dirname(javaHome));
      const scriptDir = path.join(work, 'scripts');
      const projectDir = path.join(work, 'project');
      await fsp.mkdir(scriptDir);
      await fsp.mkdir(projectDir);
      await fsp.writeFile(path.join(scriptDir, 'NightmareExport.java'), ghidraScriptText(), 'utf8');
      const args = [projectDir, 'DecompilerJob', '-import', safeInput, '-scriptPath', scriptDir, '-postScript', 'NightmareExport.java', '-deleteProject'];
      const env = await makeToolEnv(work, { JAVA_HOME: javaDir });
      if (process.platform === 'win32') {
        env.PATH = `${path.join(javaDir, 'bin')}${path.delimiter}${env.PATH}`;
        const commandLine = [analyzeHeadless, ...args].map(quoteWindowsArgument).join(' ');
        const commandProcessor = path.join(env.SystemRoot, 'System32', 'cmd.exe');
        output = await runProcess(commandProcessor, ['/d', '/s', '/c', `"${commandLine}"`], {
          cwd: work,
          env,
          monitorDirectory: work,
          maxDiskOutput: 1536 * 1024 * 1024
        }, window, 'Ghidra headless');
      } else {
        await fsp.chmod(analyzeHeadless, 0o755);
        output = await runProcess(analyzeHeadless, args, {
          cwd: work,
          env,
          monitorDirectory: work,
          maxDiskOutput: 1536 * 1024 * 1024
        }, window, 'Ghidra headless');
      }
    }
    if (!output.trim()) throw new Error('Decompiler completed without producing text output.');
    return capOutput(`// Decompiler engine: ${selectedTool}\n\n${output}`);
  } finally {
    await fsp.rm(work, { recursive: true, force: true });
  }
}

function quoteWindowsArgument(argument) {
  const value = String(argument);
  if (/["\r\n%!&|<>^]/.test(value)) throw new Error('This path contains characters that cannot be safely passed to the Windows decompiler launcher.');
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

async function runCfr(java, jar, input, work, window) {
  await runProcess(java, ['-jar', jar, input, '--outputdir', path.join(work, 'cfr-output')], {
    cwd: work,
    env: await makeToolEnv(work),
    monitorDirectory: path.join(work, 'cfr-output'),
    maxDiskOutput: MAX_OUTPUT_SIZE
  }, window, 'CFR');
  const outputPath = path.join(work, 'cfr-output');
  await fsp.access(outputPath);
  return readDecompilerOutput(outputPath);
}

module.exports = { decompile, assertSupportedPlatform, stopAll };
