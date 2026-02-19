const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const ytmusic = require('./ytmusic');

// Resolve paths for binaries (handles asar unpacking)
function resolveUnpackedPath(p) {
  return p.replace('app.asar', 'app.asar.unpacked');
}

const ffmpegPath = resolveUnpackedPath(require('ffmpeg-static'));

function getYtdlpPath() {
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const bundled = resolveUnpackedPath(
    path.join(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', binName)
  );
  if (fs.existsSync(bundled)) return bundled;
  return 'yt-dlp';
}

function getYtdlpBaseArgs() {
  const args = ['--no-check-certificates', '--no-warnings'];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  const nodePath = process.execPath;
  if (nodePath) args.push('--js-runtimes', `node:${nodePath}`);
  return args;
}

let mainWindow;
const SUPPORTED_FORMATS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.aiff'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Allow webview permissions (for YouTube login, media playback)
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ['media', 'mediaKeySystem', 'clipboard-read', 'notifications'];
      callback(allowed.includes(permission));
    });
    // Allow new windows for Google login popups
    contents.setWindowOpenHandler(({ url }) => {
      if (url.includes('accounts.google.com') || url.includes('youtube.com') || url.includes('google.com')) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });
  }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

// Open file dialog
ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus', 'aiff'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Open folder dialog
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return [];
  return scanFolder(result.filePaths[0]);
});

// Scan folder recursively for audio files
function scanFolder(dirPath) {
  let audioFiles = [];
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        audioFiles = audioFiles.concat(scanFolder(fullPath));
      } else if (SUPPORTED_FORMATS.includes(path.extname(item.name).toLowerCase())) {
        audioFiles.push(fullPath);
      }
    }
  } catch (err) {
    console.error('Scan error:', err.message);
  }
  return audioFiles;
}

// Read audio metadata
ipcMain.handle('get-metadata', async (event, filePath) => {
  try {
    const metadata = await mm.parseFile(filePath);
    let coverArt = null;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      coverArt = `data:${pic.format};base64,${pic.data.toString('base64')}`;
    }
    return {
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: metadata.common.artist || 'Bilinmeyen Sanatçı',
      album: metadata.common.album || 'Bilinmeyen Albüm',
      duration: metadata.format.duration || 0,
      coverArt,
      format: path.extname(filePath).substring(1).toUpperCase(),
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
      sampleRate: metadata.format.sampleRate || null,
    };
  } catch (err) {
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artist: 'Bilinmeyen Sanatçı',
      album: 'Bilinmeyen Albüm',
      duration: 0,
      coverArt: null,
      format: path.extname(filePath).substring(1).toUpperCase(),
      bitrate: null,
      sampleRate: null,
    };
  }
});

// Read file as buffer for Web Audio API (for FLAC etc.)
ipcMain.handle('read-file-buffer', async (event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (err) {
    return null;
  }
});

// YouTube download
ipcMain.handle('youtube-download', async (event, url) => {
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);
    const settings = loadSettings();
    const downloadsPath = settings.downloadPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });

    const ytdlpPath = getYtdlpPath();
    const baseArgs = getYtdlpBaseArgs();

    // Get video info
    const { stdout: infoJson } = await execFileAsync(ytdlpPath, [
      '--dump-single-json',
      ...baseArgs,
      url,
    ], { maxBuffer: 10 * 1024 * 1024 });

    const info = JSON.parse(infoJson);
    const safeTitle = (info.title || 'download').replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    const outputPath = path.join(downloadsPath, `${safeTitle}.mp3`);

    // Download as mp3
    await execFileAsync(ytdlpPath, [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '-o', outputPath,
      '--no-playlist',
      ...baseArgs,
      url,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 300000 });

    // yt-dlp may append .mp3 to the output if it wasn't already there
    let finalPath = outputPath;
    if (!fs.existsSync(finalPath) && fs.existsSync(finalPath + '.mp3')) {
      finalPath = finalPath + '.mp3';
    }
    // Also check without double extension
    if (!fs.existsSync(finalPath)) {
      const files = fs.readdirSync(downloadsPath).filter(f => f.startsWith(safeTitle));
      if (files.length > 0) {
        finalPath = path.join(downloadsPath, files[0]);
      }
    }

    // Write ID3 tags with artist info
    const artist = info.artist || info.creator || info.uploader || info.channel || '';
    const album = info.album || '';
    try {
      const tags = { title: info.title || safeTitle };
      if (artist) tags.artist = artist;
      if (album) tags.album = album;
      // Try to embed thumbnail
      if (info.thumbnail) {
        try {
          const https = require('https');
          const http = require('http');
          const thumbUrl = info.thumbnail;
          const fetcher = thumbUrl.startsWith('https') ? https : http;
          const thumbData = await new Promise((resolve, reject) => {
            fetcher.get(thumbUrl, (res) => {
              const chunks = [];
              res.on('data', c => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });
          tags.image = {
            mime: 'image/jpeg',
            type: { id: 3, name: 'front cover' },
            description: 'Cover',
            imageBuffer: thumbData,
          };
        } catch (e) { /* thumbnail embed failed, skip */ }
      }
      NodeID3.write(tags, finalPath);
    } catch (tagErr) {
      console.error('ID3 write error:', tagErr.message);
    }

    return {
      success: true,
      filePath: finalPath,
      title: info.title || safeTitle,
      artist: artist || 'YouTube',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || null,
    };
  } catch (err) {
    console.error('YouTube download error:', err);
    return { success: false, error: err.stderr || err.message || 'İndirme başarısız' };
  }
});

// Save/Load playlists
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const defaultDataPath = app.getPath('userData');

// --- Settings ---
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (err) {}
  return { downloadPath: path.join(__dirname, 'downloads'), dataPath: '' };
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function getDataPath() {
  const settings = loadSettings();
  return settings.dataPath || defaultDataPath;
}

function getPlaylistsPath() {
  return path.join(getDataPath(), 'playlists.json');
}

function getLibraryPath() {
  return path.join(getDataPath(), 'library.json');
}

ipcMain.handle('load-settings', async () => {
  return loadSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    saveSettings(settings);
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// --- Library Persistence ---
ipcMain.handle('save-library', async (event, library) => {
  try {
    const p = getLibraryPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(library, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('load-library', async () => {
  try {
    const p = getLibraryPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (err) {}
  return [];
});

ipcMain.handle('save-playlists', async (event, playlists) => {
  try {
    const p = getPlaylistsPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(playlists, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('load-playlists', async () => {
  try {
    const p = getPlaylistsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (err) {}
  return [];
});

// Get downloads folder path
ipcMain.handle('get-downloads-path', () => {
  return path.join(__dirname, 'downloads');
});

// Get current data path
ipcMain.handle('get-data-path', () => {
  return getDataPath();
});

// Reveal in explorer
ipcMain.handle('reveal-in-explorer', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// --- YouTube Music API ---
async function getYtMusicAuth() {
  const ses = session.fromPartition('persist:youtube');
  const cookies = await ses.cookies.get({ domain: '.youtube.com' });
  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const sapiSid =
    cookies.find((c) => c.name === '__Secure-3PAPISID') ||
    cookies.find((c) => c.name === 'SAPISID');
  return {
    cookieStr,
    sapiSid: sapiSid?.value || null,
    isLoggedIn: !!sapiSid,
  };
}

ipcMain.handle('yt-music-check-auth', async () => {
  const auth = await getYtMusicAuth();
  return { isLoggedIn: auth.isLoggedIn };
});

ipcMain.handle('yt-music-get-home', async () => {
  try {
    const auth = await getYtMusicAuth();
    if (!auth.isLoggedIn) return { error: 'not_logged_in', shelves: [] };
    const shelves = await ytmusic.getHome(auth.cookieStr, auth.sapiSid);
    return { shelves };
  } catch (err) {
    console.error('YT Music home error:', err);
    return { error: err.message, shelves: [] };
  }
});

ipcMain.handle('yt-music-search', async (event, query) => {
  try {
    const auth = await getYtMusicAuth();
    if (!auth.isLoggedIn) return { error: 'not_logged_in', results: [] };
    const results = await ytmusic.search(query, auth.cookieStr, auth.sapiSid);
    return { results };
  } catch (err) {
    console.error('YT Music search error:', err);
    return { error: err.message, results: [] };
  }
});

ipcMain.handle('yt-music-get-playlist', async (event, browseId) => {
  try {
    const auth = await getYtMusicAuth();
    if (!auth.isLoggedIn) return { error: 'not_logged_in' };
    const data = await ytmusic.getPlaylist(browseId, auth.cookieStr, auth.sapiSid);
    return data;
  } catch (err) {
    console.error('YT Music playlist error:', err);
    return { error: err.message, tracks: [] };
  }
});

// Get stream URL for preview playback
ipcMain.handle('yt-get-stream-url', async (event, videoId) => {
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const execFileAsync = promisify(execFile);

    const ytdlpPath = getYtdlpPath();
    const baseArgs = getYtdlpBaseArgs();

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const { stdout } = await execFileAsync(ytdlpPath, [
      '-f', 'bestaudio',
      '-g',
      ...baseArgs,
      url,
    ], { maxBuffer: 5 * 1024 * 1024, timeout: 20000 });

    return { success: true, streamUrl: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
