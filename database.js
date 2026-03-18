'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Initialize the SQLite database.
 * Creates tables if they don't exist and migrates from JSON if needed.
 * @param {string} dbPath - Full path to the .db file
 * @param {object} [jsonPaths] - Optional paths to existing JSON files for migration
 * @param {string} [jsonPaths.library] - Path to library.json
 * @param {string} [jsonPaths.playlists] - Path to playlists.json
 * @param {string} [jsonPaths.settings] - Path to settings.json
 */
function init(dbPath, jsonPaths) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();

  // Migrate from JSON files if database is empty and JSON files exist
  if (jsonPaths) {
    migrateFromJson(jsonPaths);
  }

  return db;
}

/**
 * Create all tables if they don't exist.
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filePath TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL DEFAULT 0,
      format TEXT,
      bitrate INTEGER,
      sampleRate INTEGER
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      filePath TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_library_album ON library(album);
    CREATE INDEX IF NOT EXISTS idx_library_artist ON library(artist);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
  `);
}

// ============================================================
// Library CRUD
// ============================================================

/**
 * Save library tracks. Replaces all existing tracks.
 * @param {Array} tracks - Array of track objects
 */
function saveLibrary(tracks) {
  const insertOrReplace = db.prepare(`
    INSERT OR REPLACE INTO library (filePath, title, artist, album, duration, format, bitrate, sampleRate)
    VALUES (@filePath, @title, @artist, @album, @duration, @format, @bitrate, @sampleRate)
  `);

  const deleteAll = db.prepare('DELETE FROM library');
  const existingPaths = db.prepare('SELECT filePath FROM library').all().map(r => r.filePath);

  const transaction = db.transaction((trackList) => {
    // Build a set of incoming file paths
    const incomingPaths = new Set(trackList.map(t => t.filePath));

    // Delete tracks that are no longer in the library
    const toDelete = existingPaths.filter(p => !incomingPaths.has(p));
    if (toDelete.length > 0) {
      const deleteMissing = db.prepare('DELETE FROM library WHERE filePath = ?');
      for (const fp of toDelete) {
        deleteMissing.run(fp);
      }
    }

    // Insert or update all tracks
    for (const track of trackList) {
      insertOrReplace.run({
        filePath: track.filePath || '',
        title: track.title || null,
        artist: track.artist || null,
        album: track.album || null,
        duration: track.duration || 0,
        format: track.format || null,
        bitrate: track.bitrate || null,
        sampleRate: track.sampleRate || null,
      });
    }
  });

  transaction(tracks);
}

/**
 * Load all library tracks.
 * @returns {Array} Array of track objects
 */
function loadLibrary() {
  return db.prepare(`
    SELECT filePath, title, artist, album, duration, format, bitrate, sampleRate
    FROM library ORDER BY id
  `).all();
}

// ============================================================
// Playlists CRUD
// ============================================================

/**
 * Save playlists. Replaces all existing playlists.
 * @param {Array} playlists - Array of { name, tracks: [filePath, ...] }
 */
function savePlaylists(playlists) {
  const transaction = db.transaction((playlistList) => {
    // Clear existing data
    db.prepare('DELETE FROM playlist_tracks').run();
    db.prepare('DELETE FROM playlists').run();

    const insertPlaylist = db.prepare(
      'INSERT INTO playlists (name, position) VALUES (?, ?)'
    );
    const insertTrack = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, filePath, position) VALUES (?, ?, ?)'
    );

    for (let i = 0; i < playlistList.length; i++) {
      const pl = playlistList[i];
      const result = insertPlaylist.run(pl.name, i);
      const playlistId = result.lastInsertRowid;

      if (pl.tracks && Array.isArray(pl.tracks)) {
        for (let j = 0; j < pl.tracks.length; j++) {
          insertTrack.run(playlistId, pl.tracks[j], j);
        }
      }
    }
  });

  transaction(playlists);
}

/**
 * Load all playlists with their tracks.
 * @returns {Array} Array of { name, tracks: [filePath, ...] }
 */
function loadPlaylists() {
  const playlists = db.prepare(
    'SELECT id, name FROM playlists ORDER BY position'
  ).all();

  const getPlaylistTracks = db.prepare(
    'SELECT filePath FROM playlist_tracks WHERE playlist_id = ? ORDER BY position'
  );

  return playlists.map(pl => ({
    name: pl.name,
    tracks: getPlaylistTracks.all(pl.id).map(t => t.filePath),
  }));
}

// ============================================================
// Settings CRUD
// ============================================================

/**
 * Save settings object. Each key becomes a row.
 * @param {object} settings - Key-value settings object
 */
function saveSettings(settings) {
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );

  const transaction = db.transaction((obj) => {
    for (const [key, val] of Object.entries(obj)) {
      upsert.run(key, JSON.stringify(val));
    }
  });

  transaction(settings);
}

/**
 * Load all settings as a flat object.
 * @param {object} defaults - Default settings values
 * @returns {object} Merged settings
 */
function loadSettings(defaults = {}) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const saved = {};
  for (const row of rows) {
    try {
      saved[row.key] = JSON.parse(row.value);
    } catch (e) {
      saved[row.key] = row.value;
    }
  }
  return { ...defaults, ...saved };
}

// ============================================================
// Migration from JSON
// ============================================================

/**
 * Migrate data from existing JSON files to SQLite (only if tables are empty).
 */
function migrateFromJson(jsonPaths) {
  // Migrate settings
  if (jsonPaths.settings && fs.existsSync(jsonPaths.settings)) {
    const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM settings').get().cnt;
    if (settingsCount === 0) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPaths.settings, 'utf-8'));
        saveSettings(data);
        console.log('Migrated settings from JSON to SQLite');
      } catch (e) {
        console.error('Settings migration error:', e.message);
      }
    }
  }

  // Migrate library
  if (jsonPaths.library && fs.existsSync(jsonPaths.library)) {
    const libraryCount = db.prepare('SELECT COUNT(*) as cnt FROM library').get().cnt;
    if (libraryCount === 0) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPaths.library, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) {
          saveLibrary(data);
          console.log('Migrated library from JSON to SQLite (' + data.length + ' tracks)');
        }
      } catch (e) {
        console.error('Library migration error:', e.message);
      }
    }
  }

  // Migrate playlists
  if (jsonPaths.playlists && fs.existsSync(jsonPaths.playlists)) {
    const playlistCount = db.prepare('SELECT COUNT(*) as cnt FROM playlists').get().cnt;
    if (playlistCount === 0) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPaths.playlists, 'utf-8'));
        if (Array.isArray(data) && data.length > 0) {
          savePlaylists(data);
          console.log('Migrated playlists from JSON to SQLite (' + data.length + ' playlists)');
        }
      } catch (e) {
        console.error('Playlists migration error:', e.message);
      }
    }
  }
}

/**
 * Close the database connection.
 */
function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  init,
  close,
  saveLibrary,
  loadLibrary,
  savePlaylists,
  loadPlaylists,
  saveSettings,
  loadSettings,
};
