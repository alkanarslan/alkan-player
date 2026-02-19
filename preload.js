const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // File operations
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getMetadata: (filePath) => ipcRenderer.invoke('get-metadata', filePath),
  readFileBuffer: (filePath) => ipcRenderer.invoke('read-file-buffer', filePath),

  // YouTube
  youtubeDownload: (url) => ipcRenderer.invoke('youtube-download', url),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),

  // Playlists
  savePlaylists: (data) => ipcRenderer.invoke('save-playlists', data),
  loadPlaylists: () => ipcRenderer.invoke('load-playlists'),

  // Library persistence
  saveLibrary: (data) => ipcRenderer.invoke('save-library', data),
  loadLibrary: () => ipcRenderer.invoke('load-library'),

  // Settings
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // YouTube Music API
  ytMusicCheckAuth: () => ipcRenderer.invoke('yt-music-check-auth'),
  ytMusicGetHome: () => ipcRenderer.invoke('yt-music-get-home'),
  ytMusicSearch: (query) => ipcRenderer.invoke('yt-music-search', query),
  ytMusicGetPlaylist: (browseId) => ipcRenderer.invoke('yt-music-get-playlist', browseId),
  ytGetStreamUrl: (videoId) => ipcRenderer.invoke('yt-get-stream-url', videoId),

  // Utility
  revealInExplorer: (filePath) => ipcRenderer.invoke('reveal-in-explorer', filePath),
});
