These instructions apply to the entire repository.

## Project Overview

- **Alkan Player** is an Electron (v40.8.0) desktop music player written in vanilla JavaScript.
- No TypeScript, no module bundler, no linting/formatting tools, and no test framework are configured.
- The app supports local audio playback (MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS, AIFF), a 10-band equalizer, audio visualizer, YouTube downloading/streaming, YouTube Music browsing, and Spotify playlist import.

## Architecture

| File | Role |
|---|---|
| `main.js` | Main process: BrowserWindow setup, IPC handlers, filesystem access, metadata parsing, YouTube/Spotify integrations. |
| `preload.js` | Context bridge: exposes `window.electronAPI` to the renderer via `contextBridge.exposeInMainWorld`. |
| `src/renderer.js` | Renderer process (~3,450 lines): UI logic, playback, Web Audio API (EQ, visualizer, VU meter), i18n, state management. |
| `src/index.html` | UI markup (frameless window with glassmorphism design). |
| `src/styles.css` | All styling, CSS custom properties for theming (6 themes). |
| `ytmusic.js` | YouTube Music internal API client (browse, search, playlist, stream URL resolution). |

### Electron Process Boundary

- **Main process** (`main.js`, `preload.js`, `ytmusic.js`): Node.js APIs, filesystem, `child_process`, native dialogs, network requests.
- **Renderer process** (`src/renderer.js`): DOM, Web Audio API, canvas rendering. Communicates with main via `window.electronAPI`.
- Privileged or filesystem work belongs in `main.js` or `preload.js`, never directly in renderer code.
- When adding renderer functionality, wire new native capabilities through `preload.js` and IPC (`ipcMain.handle` / `ipcRenderer.invoke`) instead of exposing Node.js APIs.

## Build, Run, and Test Commands

```bash
# Install dependencies
npm install

# Start the app
npm start

# Start in dev mode (opens DevTools)
npm run dev

# Build distributables (all platforms)
npm run build

# Platform-specific builds
npm run build:win
npm run build:mac
npm run build:linux
npm run build:portable
```

### Testing

- **No test framework is configured.** There are no test files in the repository.
- If tests are added in the future, document the single-test command here.
- For now, verify changes by running `npm start` or `npm run dev` and performing manual smoke testing.

### Build System

- Uses `electron-builder` (not Electron Forge). Configuration is inline in `package.json` under the `"build"` key.
- No webpack, vite, or other bundler — source files are served directly to Electron.
- `ffmpeg-static` and `youtube-dl-exec/bin` are unpacked from asar via `asarUnpack`.

## Code Style Guidelines

### Language and Modules

- **Vanilla JavaScript only** — no TypeScript, no JSX, no framework.
- Main process uses **CommonJS** (`require` / `module.exports`).
- Renderer uses **browser globals** (no module system; everything lives in a single `renderer.js` file).
- No external linter or formatter is configured. Follow the existing patterns described below.

### Formatting

- **2-space indentation** throughout all JS, HTML, and CSS files.
- **Single quotes** in main process files (`main.js`, `preload.js`, `ytmusic.js`).
- **Double quotes** in renderer (`src/renderer.js`) — follow whichever quote style the target file already uses.
- **Trailing commas** in multi-line object/array literals.
- **Semicolons** are used consistently — always include them.
- Line length: no hard limit, but keep lines reasonable (~120 chars).

### Naming Conventions

- **Functions and variables**: `camelCase` — e.g. `formatTime`, `showToast`, `audioContext`, `isPlaying`.
- **Constants**: `UPPER_SNAKE_CASE` — e.g. `SUPPORTED_FORMATS`, `YT_MUSIC_ORIGIN`, `CLIENT_CONTEXT`.
- **DOM element cache**: stored in the `els` object using `camelCase` keys — e.g. `els.trackList`, `els.playBtn`.
- **CSS classes and IDs**: `kebab-case` — e.g. `#track-list`, `.toast`, `#btn-play`.
- **IPC channel names**: `kebab-case` — e.g. `'window-minimize'`, `'open-files'`, `'get-metadata'`.
- **State properties**: `camelCase` in the global `state` object — e.g. `state.currentTrack`, `state.librarySort`.

### Imports / Requires

- Group requires at the top of the file in this order:
  1. Electron modules (`electron`, `path`, `fs`)
  2. Third-party packages (`music-metadata`, `node-id3`, etc.)
  3. Local modules (`./ytmusic`)
- Some modules are required inline inside IPC handlers (e.g. `child_process`, `https`). This is acceptable for infrequently-used modules.

### Error Handling

- IPC handlers use **try/catch** blocks. On error, return a fallback value (e.g. `null`, `[]`, or `{ success: false, error: message }`).
- Errors are logged with `console.error('Descriptive prefix:', err.message)`.
- The renderer uses `showToast(message, 'error')` to surface errors to the user.
- Use optional chaining (`?.`) extensively for deeply nested data (especially YouTube API responses).
- Silent catch blocks (`catch(e) {}`) are used sparingly for truly non-critical failures.

### IPC Patterns

- **One-way events** (`ipcMain.on` / `ipcRenderer.send`): used for fire-and-forget actions like window controls.
- **Request/response** (`ipcMain.handle` / `ipcRenderer.invoke`): used for all data-returning operations.
- Every IPC channel exposed in `preload.js` must have a corresponding handler in `main.js`.

### State Management

- All renderer state lives in the global `state` object at the top of `renderer.js`.
- There is no reactive framework — UI updates are imperative (direct DOM manipulation).
- Persist state via `window.electronAPI.saveLibrary()`, `saveSettings()`, `savePlaylists()`.

### DOM Utilities

- `$()` and `$$()` are defined as aliases for `document.querySelector` / `document.querySelectorAll`.
- DOM elements that are accessed repeatedly are cached in the `els` object.

### Internationalization

- The `translations` object in `renderer.js` maps string keys to localized text (Turkish, English, Arabic, Italian).
- Use the `t(key, params)` function to retrieve translated strings.
- Translation keys use dot notation: `'nav.library'`, `'settings.theme'`, `'ytmusic.searchPlaceholder'`.

## General Guidelines

- Keep changes small and focused; avoid broad refactors unless the task requires them.
- Reuse existing naming and UI patterns instead of introducing new abstractions without need.
- Follow the existing vanilla JavaScript, HTML, and CSS style used in the repo.
- Update `README.md` when user-facing setup, scripts, or major features change.
- After code changes, run the smallest relevant verification first.
- For app-wide changes, prefer at least a smoke check with `npm start` or `npm run dev` when practical.
- If build packaging is affected, run the narrowest relevant build script instead of all build targets.
- Do not commit generated outputs (`dist/`) or dependencies (`node_modules/`).
- Keep `.gitignore` aligned with Electron build artifacts, downloads, and local dependency folders.

## Dependencies

### Runtime (`dependencies`)
- `ffmpeg-static` — FFmpeg binary for audio conversion.
- `music-metadata` — Parses audio file metadata (title, artist, album, cover art).
- `node-id3` — ID3 tag reading/writing.
- `youtube-dl-exec` — `yt-dlp` wrapper for YouTube downloading.

### Dev (`devDependencies`)
- `electron` — Electron framework.
- `electron-builder` — Packaging and distribution.
