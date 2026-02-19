// ============================================
// ALKAN PLAYER - Renderer
// ============================================

// --- State ---
const state = {
  library: [],        // [{filePath, title, artist, album, duration, coverArt, format, bitrate}]
  playlists: [],      // [{id, name, tracks: [filePath]}]
  currentTrack: null,
  currentIndex: -1,
  isPlaying: false,
  shuffle: false,
  repeat: 'none',     // none, all, one
  volume: 0.8,
  currentView: 'library',
  activePlaylistId: null,
  searchQuery: '',
  downloads: [],
  settings: {
    downloadPath: '',
    dataPath: '',
  },
};

// --- Audio Engine ---
let audioElement = new Audio();
let audioContext = null;
let analyser = null;
let analyserL = null;
let analyserR = null;
let sourceNode = null;
let eqFilters = [];
let isAudioContextConnected = false;

function initAudioContext() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.82;

  // Stereo analysers for VU meter
  analyserL = audioContext.createAnalyser();
  analyserR = audioContext.createAnalyser();
  analyserL.fftSize = 256;
  analyserR.fftSize = 256;
  analyserL.smoothingTimeConstant = 0.85;
  analyserR.smoothingTimeConstant = 0.85;

  // EQ filters
  const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  eqFilters = frequencies.map((freq, i) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = i === 0 ? 'lowshelf' : i === frequencies.length - 1 ? 'highshelf' : 'peaking';
    filter.frequency.value = freq;
    filter.gain.value = 0;
    filter.Q.value = 1;
    return filter;
  });
}

function connectAudioGraph() {
  if (isAudioContextConnected) return;
  initAudioContext();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  
  // Chain: source -> eq filters -> analyser -> destination
  let lastNode = sourceNode;
  eqFilters.forEach(filter => {
    lastNode.connect(filter);
    lastNode = filter;
  });
  lastNode.connect(analyser);
  analyser.connect(audioContext.destination);

  // Stereo split for VU meter
  const splitter = audioContext.createChannelSplitter(2);
  lastNode.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);

  isAudioContextConnected = true;
}

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  trackList: $('#track-list'),
  playBtn: $('#btn-play'),
  playIcon: $('#play-icon'),
  prevBtn: $('#btn-prev'),
  nextBtn: $('#btn-next'),
  shuffleBtn: $('#btn-shuffle'),
  repeatBtn: $('#btn-repeat'),
  volumeSlider: $('#volume-slider'),
  volumeKnob: $('#volume-knob-canvas'),
  volumeKnobWrapper: $('#volume-knob-wrapper'),
  progressContainer: $('#progress-container'),
  progressFill: $('#progress-fill'),
  progressThumb: $('#progress-thumb'),
  currentTime: $('#current-time'),
  totalTime: $('#total-time'),
  trackTitle: $('#track-title'),
  trackArtist: $('#track-artist'),
  albumArt: $('#album-art'),
  searchInput: $('#search-input'),
  canvas: $('#visualizer-canvas'),
  vuCanvas: $('#vu-meter-canvas'),
  contextMenu: $('#context-menu'),
  toastContainer: $('#toast-container'),
  playlistGrid: $('#playlist-grid'),
  playlistDetail: $('#playlist-detail'),
  playlistDetailName: $('#playlist-detail-name'),
  playlistTrackCount: $('#playlist-track-count'),
  playlistTracks: $('#playlist-tracks'),
  youtubeUrl: $('#youtube-url'),
  downloadStatus: $('#download-status'),
  downloadList: $('#download-list'),
  eqPreset: $('#eq-preset'),
};

// --- Utility ---
function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// --- Views ---
function switchView(viewName) {
  state.currentView = viewName;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${viewName}`)?.classList.add('active');
  $$('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewName);
  });
  
  if (viewName === 'playlists') {
    renderPlaylists();
    els.playlistDetail.classList.add('hidden');
    els.playlistGrid.style.display = '';
  }
  if (viewName === 'settings') {
    renderSettings();
  }
  if (viewName === 'ytmusic') {
    initYtMusic();
  }
}

// --- Library ---
async function addFilesToLibrary(filePaths) {
  let added = 0;
  for (const fp of filePaths) {
    if (state.library.some(t => t.filePath === fp)) continue;
    const meta = await window.electronAPI.getMetadata(fp);
    state.library.push({ filePath: fp, ...meta });
    added++;
  }
  renderTrackList();
  if (added > 0) {
    showToast(`${added} şarkı eklendi`, 'success');
    saveLibrary();
  }
}

async function saveLibrary() {
  // Save without coverArt to keep file small
  const lite = state.library.map(t => ({
    filePath: t.filePath,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    format: t.format,
    bitrate: t.bitrate,
    sampleRate: t.sampleRate,
  }));
  await window.electronAPI.saveLibrary(lite);
}

async function loadLibrary() {
  const saved = await window.electronAPI.loadLibrary();
  if (!saved || saved.length === 0) return;
  // Re-load metadata (for coverArt) in background, but show tracks immediately
  for (const track of saved) {
    if (!state.library.some(t => t.filePath === track.filePath)) {
      state.library.push(track);
    }
  }
  renderTrackList();
  // Load cover art in background
  for (let i = 0; i < state.library.length; i++) {
    if (!state.library[i].coverArt) {
      try {
        const meta = await window.electronAPI.getMetadata(state.library[i].filePath);
        if (meta.coverArt) {
          state.library[i].coverArt = meta.coverArt;
        }
      } catch (e) {}
    }
  }
}

function getFilteredLibrary() {
  if (!state.searchQuery) return state.library;
  const q = state.searchQuery.toLowerCase();
  return state.library.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.artist.toLowerCase().includes(q) ||
    t.album.toLowerCase().includes(q)
  );
}

function renderTrackList() {
  const tracks = getFilteredLibrary();
  if (tracks.length === 0) {
    els.trackList.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <p>${state.searchQuery ? 'Sonuç bulunamadı' : 'Henüz müzik eklenmedi'}</p>
        <p class="sub">${state.searchQuery ? 'Farklı bir arama deneyin' : 'Dosya veya klasör ekleyerek başlayın'}</p>
      </div>`;
    return;
  }
  
  els.trackList.innerHTML = tracks.map((t, i) => `
    <div class="track-item ${state.currentTrack?.filePath === t.filePath && state.isPlaying ? 'playing' : ''}" 
         data-index="${state.library.indexOf(t)}" data-path="${escapeHtml(t.filePath)}">
      <div class="track-item-num"><span>${i + 1}</span></div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(t.title)}</div>
        <div class="track-item-artist">${escapeHtml(t.artist)}</div>
      </div>
      <div class="track-item-album">${escapeHtml(t.album)}</div>
      <div class="track-item-format">${t.format}</div>
      <div class="track-item-duration">${formatTime(t.duration)}</div>
    </div>`
  ).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Playback ---
async function playTrack(index, trackList = null) {
  const list = trackList || state.library;
  if (index < 0 || index >= list.length) return;

  const track = list[index];
  state.currentTrack = track;
  state.currentIndex = index;

  connectAudioGraph();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  audioElement.src = `file://${track.filePath.replace(/\\/g, '/')}`;
  audioElement.volume = state.volume;

  try {
    await audioElement.play();
    state.isPlaying = true;
    updatePlayButton();
    updateNowPlaying();
    renderTrackList();
    startVisualizer();
    startVuMeter();
  } catch (err) {
    console.error('Playback error:', err);
    showToast('Çalma hatası: ' + err.message, 'error');
  }
}

function togglePlay() {
  if (!state.currentTrack) {
    if (state.library.length > 0) {
      playTrack(0);
    }
    return;
  }

  if (state.isPlaying) {
    audioElement.pause();
    state.isPlaying = false;
  } else {
    connectAudioGraph();
    if (audioContext?.state === 'suspended') audioContext.resume();
    audioElement.play();
    state.isPlaying = true;
  }
  updatePlayButton();
  renderTrackList();
}

function playNext() {
  if (state.library.length === 0) return;
  if (state.repeat === 'one') {
    audioElement.currentTime = 0;
    audioElement.play();
    return;
  }

  let nextIndex;
  if (state.shuffle) {
    nextIndex = Math.floor(Math.random() * state.library.length);
  } else {
    nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.library.length) {
      if (state.repeat === 'all') nextIndex = 0;
      else { state.isPlaying = false; updatePlayButton(); return; }
    }
  }
  playTrack(nextIndex);
}

function playPrev() {
  if (state.library.length === 0) return;
  if (audioElement.currentTime > 3) {
    audioElement.currentTime = 0;
    return;
  }
  let prevIndex = state.currentIndex - 1;
  if (prevIndex < 0) prevIndex = state.library.length - 1;
  playTrack(prevIndex);
}

function updatePlayButton() {
  if (state.isPlaying) {
    els.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    els.albumArt.classList.add('playing');
  } else {
    els.playIcon.innerHTML = '<polygon points="6,3 20,12 6,21"/>';
    els.albumArt.classList.remove('playing');
  }
}

function updateNowPlaying() {
  if (!state.currentTrack) return;
  const t = state.currentTrack;
  els.trackTitle.textContent = t.title;
  els.trackArtist.textContent = t.artist;
  
  if (t.coverArt) {
    els.albumArt.innerHTML = `<img src="${t.coverArt}" alt="Cover">`;
  } else {
    els.albumArt.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
      </svg>`;
  }

  // Update document title
  document.title = `${t.title} - ${t.artist} | Alkan Player`;
}

// --- Progress ---
audioElement.addEventListener('timeupdate', () => {
  if (!audioElement.duration) return;
  const pct = (audioElement.currentTime / audioElement.duration) * 100;
  els.progressFill.style.width = pct + '%';
  els.currentTime.textContent = formatTime(audioElement.currentTime);
});

audioElement.addEventListener('loadedmetadata', () => {
  els.totalTime.textContent = formatTime(audioElement.duration);
});

audioElement.addEventListener('ended', () => {
  playNext();
});

els.progressContainer.addEventListener('click', (e) => {
  if (!audioElement.duration) return;
  const rect = els.progressContainer.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioElement.currentTime = pct * audioElement.duration;
});

// Drag progress
let isDraggingProgress = false;
els.progressContainer.addEventListener('mousedown', (e) => {
  isDraggingProgress = true;
  updateProgressFromMouse(e);
});
document.addEventListener('mousemove', (e) => {
  if (isDraggingProgress) updateProgressFromMouse(e);
});
document.addEventListener('mouseup', () => {
  isDraggingProgress = false;
});

function updateProgressFromMouse(e) {
  if (!audioElement.duration) return;
  const rect = els.progressContainer.getBoundingClientRect();
  let pct = (e.clientX - rect.left) / rect.width;
  pct = Math.max(0, Math.min(1, pct));
  audioElement.currentTime = pct * audioElement.duration;
  els.progressFill.style.width = (pct * 100) + '%';
}

// --- Volume Knob ---
function drawVolumeKnob() {
  const canvas = els.volumeKnob;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const S = 128;
  canvas.width = S * dpr;
  canvas.height = S * dpr;
  ctx.scale(dpr, dpr);

  const cx = S / 2, cy = S / 2, R = 56;
  const vol = state.volume;

  // Knob arc range: 135° to 405° (= -45° → 225° from top)
  const startAngle = (135 * Math.PI) / 180;
  const endAngle = (405 * Math.PI) / 180;
  const volAngle = startAngle + vol * (endAngle - startAngle);

  ctx.clearRect(0, 0, S, S);

  // Outer track (dark)
  ctx.beginPath();
  ctx.arc(cx, cy, R, startAngle, endAngle);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Active arc (gradient: green → yellow → red)
  if (vol > 0.01) {
    const grad = ctx.createConicGradient(startAngle - Math.PI / 2, cx, cy);
    grad.addColorStop(0, '#3ddc84');
    grad.addColorStop(0.5, '#fbbf24');
    grad.addColorStop(0.8, '#ef4444');
    grad.addColorStop(1, '#ef4444');
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, volAngle);
    ctx.lineWidth = 6;
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Glow at the end of the arc
  if (vol > 0.01) {
    const gx = cx + Math.cos(volAngle) * R;
    const gy = cy + Math.sin(volAngle) * R;
    const glowColor = vol < 0.5 ? 'rgba(61,220,132,0.4)' : vol < 0.8 ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.4)';
    const dotGlow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 20);
    dotGlow.addColorStop(0, glowColor);
    dotGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dotGlow;
    ctx.fillRect(gx - 20, gy - 20, 40, 40);
  }

  // Knob body (dark metallic circle)
  const knobR = 38;
  const bodyGrad = ctx.createRadialGradient(cx - 6, cy - 6, 0, cx, cy, knobR);
  bodyGrad.addColorStop(0, '#3a3a42');
  bodyGrad.addColorStop(0.6, '#26262c');
  bodyGrad.addColorStop(1, '#1a1a1e');
  ctx.beginPath();
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Knob edge highlight
  ctx.beginPath();
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();

  // Brushed concentric rings
  for (let r = 10; r < knobR; r += 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.stroke();
  }

  // Indicator line on knob
  const indLen = knobR - 6;
  const ix = cx + Math.cos(volAngle) * 14;
  const iy = cy + Math.sin(volAngle) * 14;
  const ox = cx + Math.cos(volAngle) * indLen;
  const oy = cy + Math.sin(volAngle) * indLen;
  ctx.beginPath();
  ctx.moveTo(ix, iy);
  ctx.lineTo(ox, oy);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Volume percentage text
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(vol * 100), cx, cy);
}

// Knob interaction (drag + wheel)
let knobDragging = false;

function getKnobAngleFromEvent(e) {
  const rect = els.volumeKnob.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  let angle = Math.atan2(dy, dx);
  // Map angle to 0-1 volume (135° to 405°)
  const startA = (135 * Math.PI) / 180;
  const endA = (405 * Math.PI) / 180;
  // Normalize angle to be >= startA
  if (angle < startA - Math.PI) angle += Math.PI * 2;
  if (angle < startA) angle += Math.PI * 2;
  let vol = (angle - startA) / (endA - startA);
  return Math.max(0, Math.min(1, vol));
}

els.volumeKnobWrapper?.addEventListener('mousedown', (e) => {
  knobDragging = true;
  const vol = getKnobAngleFromEvent(e);
  setVolume(vol);
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!knobDragging) return;
  const vol = getKnobAngleFromEvent(e);
  setVolume(vol);
});

document.addEventListener('mouseup', () => { knobDragging = false; });

els.volumeKnobWrapper?.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.03 : 0.03;
  setVolume(Math.max(0, Math.min(1, state.volume + delta)));
}, { passive: false });

// Double-click to mute/unmute
els.volumeKnobWrapper?.addEventListener('dblclick', () => {
  if (state.volume > 0) {
    state._prevVolume = state.volume;
    setVolume(0);
  } else {
    setVolume(state._prevVolume || 0.8);
  }
});

function setVolume(vol) {
  state.volume = vol;
  audioElement.volume = vol;
  els.volumeSlider.value = vol * 100;
  drawVolumeKnob();
}

function updateVolumeIcon() {
  drawVolumeKnob();
}

// Initial draw
drawVolumeKnob();

// --- Controls ---
els.playBtn.addEventListener('click', togglePlay);
els.nextBtn.addEventListener('click', playNext);
els.prevBtn.addEventListener('click', playPrev);

els.shuffleBtn.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  els.shuffleBtn.classList.toggle('active', state.shuffle);
  showToast(state.shuffle ? 'Karışık: Açık' : 'Karışık: Kapalı', 'info');
});

els.repeatBtn.addEventListener('click', () => {
  const modes = ['none', 'all', 'one'];
  const i = (modes.indexOf(state.repeat) + 1) % modes.length;
  state.repeat = modes[i];
  els.repeatBtn.classList.toggle('active', state.repeat !== 'none');
  const labels = { none: 'Tekrar: Kapalı', all: 'Tümünü Tekrarla', one: 'Birini Tekrarla' };
  showToast(labels[state.repeat], 'info');
  
  if (state.repeat === 'one') {
    els.repeatBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
        <text x="12" y="15" font-size="8" fill="currentColor" text-anchor="middle" font-weight="bold">1</text>
      </svg>`;
  } else {
    els.repeatBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
      </svg>`;
  }
});

// --- Track List Click ---
els.trackList.addEventListener('click', (e) => {
  const item = e.target.closest('.track-item');
  if (!item) return;
  const index = parseInt(item.dataset.index);
  playTrack(index);
});

els.trackList.addEventListener('contextmenu', (e) => {
  const item = e.target.closest('.track-item');
  if (!item) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, item.dataset.path, parseInt(item.dataset.index));
});

// --- Context Menu ---
let contextTarget = null;

function showContextMenu(x, y, filePath, index) {
  contextTarget = { filePath, index };
  els.contextMenu.classList.remove('hidden');
  els.contextMenu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  els.contextMenu.style.top = Math.min(y, window.innerHeight - 160) + 'px';
}

document.addEventListener('click', () => {
  els.contextMenu.classList.add('hidden');
});

$$('.context-item').forEach(item => {
  item.addEventListener('click', () => {
    if (!contextTarget) return;
    const action = item.dataset.action;
    if (action === 'play') {
      playTrack(contextTarget.index);
    } else if (action === 'remove') {
      state.library = state.library.filter(t => t.filePath !== contextTarget.filePath);
      renderTrackList();
      saveLibrary();
      showToast('Şarkı kaldırıldı', 'info');
    } else if (action === 'reveal') {
      window.electronAPI.revealInExplorer(contextTarget.filePath);
    } else if (action === 'add-to-playlist') {
      showPlaylistPicker(contextTarget.filePath);
    }
  });
});

function showPlaylistPicker(filePath) {
  if (state.playlists.length === 0) {
    showToast('Önce bir çalma listesi oluşturun', 'info');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const listItems = state.playlists.map((p, i) =>
    `<button class="playlist-pick-item" data-idx="${i}">${p.name} <span style="color:var(--text-muted);font-size:12px">(${p.tracks.length} şarkı)</span></button>`
  ).join('');
  overlay.innerHTML = `
    <div class="modal">
      <h3>Çalma Listesine Ekle</h3>
      <div class="playlist-pick-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-bottom:12px">
        ${listItems}
      </div>
      <div class="modal-actions">
        <button class="btn-ghost btn-cancel">İptal</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.btn-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('.playlist-pick-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (!state.playlists[idx].tracks.includes(filePath)) {
        state.playlists[idx].tracks.push(filePath);
        savePlaylists();
        showToast(`"${state.playlists[idx].name}" listesine eklendi`, 'success');
      } else {
        showToast('Şarkı zaten listede', 'info');
      }
      close();
    });
  });
}

// --- Sidebar Navigation ---
$$('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// --- File/Folder Buttons ---
$('#btn-add-files').addEventListener('click', async () => {
  const files = await window.electronAPI.openFiles();
  if (files.length > 0) addFilesToLibrary(files);
});

$('#btn-add-folder').addEventListener('click', async () => {
  const files = await window.electronAPI.openFolder();
  if (files.length > 0) addFilesToLibrary(files);
});

// --- Search ---
els.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  renderTrackList();
});

// --- Window Controls ---
$('#btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
$('#btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
$('#btn-close').addEventListener('click', () => window.electronAPI.close());

// --- Playlists ---
async function loadPlaylists() {
  state.playlists = await window.electronAPI.loadPlaylists() || [];
}

async function savePlaylists() {
  await window.electronAPI.savePlaylists(state.playlists);
}

function renderPlaylists() {
  if (state.playlists.length === 0) {
    els.playlistGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/>
        </svg>
        <p>Henüz çalma listesi yok</p>
        <p class="sub">Yeni bir çalma listesi oluşturun</p>
      </div>`;
    return;
  }

  els.playlistGrid.innerHTML = state.playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <button class="playlist-card-delete" data-delete="${p.id}" title="Sil">✕</button>
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escapeHtml(p.name)}</div>
      <div class="playlist-card-count">${p.tracks.length} şarkı</div>
    </div>`
  ).join('');

  // Click handlers
  $$('.playlist-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.playlist-card-delete')) return;
      openPlaylistDetail(card.dataset.id);
    });
  });

  $$('.playlist-card-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      state.playlists = state.playlists.filter(p => p.id !== id);
      savePlaylists();
      renderPlaylists();
      showToast('Çalma listesi silindi', 'info');
    });
  });
}

function openPlaylistDetail(playlistId) {
  const playlist = state.playlists.find(p => p.id === playlistId);
  if (!playlist) return;

  state.activePlaylistId = playlistId;
  els.playlistGrid.style.display = 'none';
  els.playlistDetail.classList.remove('hidden');
  els.playlistDetailName.textContent = playlist.name;
  els.playlistTrackCount.textContent = `${playlist.tracks.length} şarkı`;

  const tracks = playlist.tracks.map(fp => state.library.find(t => t.filePath === fp)).filter(Boolean);
  
  if (tracks.length === 0) {
    els.playlistTracks.innerHTML = `
      <div class="empty-state">
        <p>Bu listede şarkı yok</p>
        <p class="sub">Kütüphaneden şarkı ekleyin</p>
      </div>`;
    return;
  }

  els.playlistTracks.innerHTML = tracks.map((t, i) => `
    <div class="track-item ${state.currentTrack?.filePath === t.filePath && state.isPlaying ? 'playing' : ''}" 
         data-index="${state.library.indexOf(t)}" data-path="${escapeHtml(t.filePath)}">
      <div class="track-item-num"><span>${i + 1}</span></div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(t.title)}</div>
        <div class="track-item-artist">${escapeHtml(t.artist)}</div>
      </div>
      <div class="track-item-album">${escapeHtml(t.album)}</div>
      <div class="track-item-format">${t.format}</div>
      <div class="track-item-duration">${formatTime(t.duration)}</div>
    </div>`
  ).join('');

  els.playlistTracks.addEventListener('click', (e) => {
    const item = e.target.closest('.track-item');
    if (!item) return;
    playTrack(parseInt(item.dataset.index));
  });
}

$('#btn-playlist-back').addEventListener('click', () => {
  els.playlistDetail.classList.add('hidden');
  els.playlistGrid.style.display = '';
  state.activePlaylistId = null;
});

$('#btn-new-playlist').addEventListener('click', () => {
  showModal('Yeni Çalma Listesi', 'Liste adı...', (name) => {
    if (!name.trim()) return;
    state.playlists.push({ id: generateId(), name: name.trim(), tracks: [] });
    savePlaylists();
    renderPlaylists();
    showToast(`"${name}" listesi oluşturuldu`, 'success');
  });
});

// --- Modal ---
function showModal(title, placeholder, onConfirm, confirmMessage, confirmLabel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  if (confirmMessage) {
    // Confirmation modal
    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${confirmMessage}</p>
        <div class="modal-actions">
          <button class="btn-ghost btn-cancel">İptal</button>
          <button class="btn-danger" style="padding:8px 16px">${confirmLabel || 'Onayla'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.btn-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.btn-danger').addEventListener('click', () => { onConfirm(); close(); });
  } else {
    // Input modal
    overlay.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        <input type="text" placeholder="${placeholder}" autofocus>
        <div class="modal-actions">
          <button class="btn-ghost btn-cancel">İptal</button>
          <button class="btn-accent btn-confirm">Oluştur</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('input');
    input.focus();
    const close = () => overlay.remove();
    overlay.querySelector('.btn-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const confirm = () => { onConfirm(input.value); close(); };
    overlay.querySelector('.btn-confirm').addEventListener('click', confirm);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); });
  }
}

// --- YouTube Download ---
$('#btn-youtube-download').addEventListener('click', async () => {
  const url = els.youtubeUrl.value.trim();
  if (!url) {
    showToast('Lütfen bir YouTube URL girin', 'error');
    return;
  }

  if (!url.match(/youtube\.com|youtu\.be/)) {
    showToast('Geçerli bir YouTube URL girin', 'error');
    return;
  }

  els.downloadStatus.classList.remove('hidden');
  els.downloadStatus.querySelector('span').textContent = 'İndiriliyor... Bu biraz zaman alabilir.';

  const result = await window.electronAPI.youtubeDownload(url);
  els.downloadStatus.classList.add('hidden');

  if (result.success) {
    showToast(`"${result.title}" indirildi!`, 'success');
    els.youtubeUrl.value = '';
    
    // Add to downloads list
    state.downloads.push(result);
    renderDownloads();
    
    // Add to library
    addFilesToLibrary([result.filePath]);
  } else {
    showToast(`İndirme hatası: ${result.error}`, 'error');
  }
});

els.youtubeUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-youtube-download').click();
});

function renderDownloads() {
  if (state.downloads.length === 0) {
    els.downloadList.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Henüz indirme yok</p>';
    return;
  }
  els.downloadList.innerHTML = state.downloads.map(d => `
    <div class="download-item" data-path="${escapeHtml(d.filePath)}">
      <div class="download-item-icon">🎵</div>
      <div class="download-item-info">
        <div class="download-item-title">${escapeHtml(d.title)}</div>
        <div class="download-item-meta">${d.artist || 'YouTube'} · ${formatTime(d.duration)}</div>
      </div>
    </div>`
  ).join('');

  $$('.download-item').forEach(item => {
    item.addEventListener('click', () => {
      const fp = item.dataset.path;
      const idx = state.library.findIndex(t => t.filePath === fp);
      if (idx >= 0) playTrack(idx);
    });
  });
}

// --- YT Music (Native API) ---
let ytMusicLoaded = false;

async function initYtMusic() {
  const auth = await window.electronAPI.ytMusicCheckAuth();
  if (auth.isLoggedIn) {
    showYtMusicContent();
    if (!ytMusicLoaded) loadYtMusicHome();
  } else {
    showYtMusicLogin();
  }
}

function showYtMusicLogin() {
  $('#ytmusic-login').classList.remove('hidden');
  $('#ytmusic-content').classList.add('hidden');
}

function showYtMusicContent() {
  $('#ytmusic-login').classList.add('hidden');
  $('#ytmusic-content').classList.remove('hidden');
}

// Login flow
$('#btn-yt-login')?.addEventListener('click', () => {
  const loginCard = $('.ytmusic-login-card');
  const loginWv = $('#ytmusic-login-webview');
  const webview = $('#yt-login-webview');
  loginCard.classList.add('hidden');
  loginWv.classList.remove('hidden');
  webview.src = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmusic.youtube.com';
});

$('#btn-yt-login-done')?.addEventListener('click', async () => {
  const auth = await window.electronAPI.ytMusicCheckAuth();
  if (auth.isLoggedIn) {
    showYtMusicContent();
    loadYtMusicHome();
    showToast('YouTube Music\'e bağlandınız!', 'success');
  } else {
    showToast('Henüz giriş yapılmadı. Lütfen Google hesabınızla giriş yapın.', 'error');
  }
});

// Load home recommendations
async function loadYtMusicHome() {
  const loading = $('#ytmusic-loading');
  const shelvesEl = $('#ytmusic-shelves');
  if (loading) loading.classList.remove('hidden');

  const data = await window.electronAPI.ytMusicGetHome();

  if (data.error === 'not_logged_in') {
    showYtMusicLogin();
    return;
  }

  ytMusicLoaded = true;
  if (loading) loading.classList.add('hidden');

  if (!data.shelves || data.shelves.length === 0) {
    shelvesEl.innerHTML = '<div class="ytmusic-empty">Öneri bulunamadı. Sayfayı yenilemeyi deneyin.</div>';
    return;
  }

  shelvesEl.innerHTML = data.shelves.map(shelf => `
    <div class="ytmusic-shelf">
      <div class="ytmusic-section-title">${escapeHtml(shelf.title)}</div>
      <div class="ytmusic-scroll">
        ${shelf.items.map(item => renderYtCard(item)).join('')}
      </div>
    </div>
  `).join('');

  attachYtCardEvents(shelvesEl);
}

function renderYtCard(item) {
  const badge = item.type !== 'song' ? `<div class="ytmusic-card-badge ${item.type}">${item.type === 'playlist' ? 'Liste' : item.type === 'album' ? 'Albüm' : item.type}</div>` : '';
  const videoId = item.videoId || '';
  const playlistId = item.playlistId || '';
  const browseId = item.browseId || '';
  const isBrowsable = (item.type === 'playlist' || item.type === 'album') && (playlistId || browseId);

  return `
    <div class="ytmusic-card" data-video-id="${videoId}" data-playlist-id="${playlistId}" data-browse-id="${browseId}" data-title="${escapeHtml(item.title)}" data-browsable="${isBrowsable}">
      <div class="ytmusic-card-thumb">
        ${item.thumbnail ? `<img src="${item.thumbnail}" loading="lazy" alt="">` : ''}
        <div class="ytmusic-card-overlay">
          ${videoId ? `
            <button class="ytmusic-card-btn ytmusic-card-play" data-action="stream" title="Dinle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21"/>
              </svg>
            </button>
            <button class="ytmusic-card-btn ytmusic-card-dl" data-action="download" title="İndir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round"/>
              </svg>
            </button>
          ` : isBrowsable ? `
            <button class="ytmusic-card-btn ytmusic-card-play" data-action="browse" title="Göz At">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="ytmusic-card-info">
        <div class="ytmusic-card-title">${escapeHtml(item.title)}</div>
        <div class="ytmusic-card-subtitle">${escapeHtml(item.subtitle)}</div>
        ${badge}
      </div>
    </div>`;
}

function attachYtCardEvents(container) {
  // Button actions (stream / download / browse)
  container.querySelectorAll('.ytmusic-card-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('.ytmusic-card');
      const videoId = card.dataset.videoId;
      const title = card.dataset.title;
      const action = btn.dataset.action;

      if (action === 'browse') {
        const browseId = card.dataset.browseId;
        const playlistId = card.dataset.playlistId;
        const id = browseId || (playlistId ? 'VL' + playlistId : null);
        if (id) openYtPlaylistDetail(id, title);
        return;
      }

      if (!videoId) return;

      if (action === 'stream') {
        streamYtVideo(videoId, title, card.querySelector('img')?.src || '');
      } else if (action === 'download') {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        showToast(`"${title}" indiriliyor...`, 'info');
        const result = await window.electronAPI.youtubeDownload(url);
        if (result.success) {
          showToast(`"${result.title}" indirildi!`, 'success');
          state.downloads.push(result);
          renderDownloads();
          await addFilesToLibrary([result.filePath]);
        } else {
          showToast(`İndirme hatası: ${result.error}`, 'error');
        }
      }
    });
  });

  // Card click → browse into playlist/album
  container.querySelectorAll('.ytmusic-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.ytmusic-card-btn')) return;
      const browsable = card.dataset.browsable === 'true';
      const videoId = card.dataset.videoId;

      if (browsable) {
        const browseId = card.dataset.browseId;
        const playlistId = card.dataset.playlistId;
        const id = browseId || (playlistId ? 'VL' + playlistId : null);
        if (id) openYtPlaylistDetail(id, card.dataset.title);
      } else if (videoId) {
        const title = card.dataset.title;
        streamYtVideo(videoId, title, card.querySelector('img')?.src || '');
      }
    });
  });
}

// --- Stream YT video (preview) ---
let currentStreamVideoId = null;

async function streamYtVideo(videoId, title, thumbnail) {
  if (currentStreamVideoId === videoId && state.isPlaying) return;

  showToast('Şarkı yükleniyor...', 'info');
  els.trackTitle.textContent = title;
  els.trackArtist.textContent = 'YouTube Music';
  if (thumbnail) {
    els.albumArt.innerHTML = `<img src="${thumbnail}" alt="Cover">`;
  }

  const result = await window.electronAPI.ytGetStreamUrl(videoId);
  if (!result.success) {
    showToast('Akış alınamadı: ' + result.error, 'error');
    return;
  }

  connectAudioGraph();
  if (audioContext?.state === 'suspended') await audioContext.resume();

  audioElement.src = result.streamUrl;
  audioElement.volume = state.volume;

  try {
    await audioElement.play();
    state.isPlaying = true;
    state.currentTrack = { filePath: '', title, artist: 'YouTube Music', coverArt: thumbnail, _ytVideoId: videoId };
    currentStreamVideoId = videoId;
    updatePlayButton();
    startVisualizer();
    startVuMeter();
    document.querySelectorAll('.yt-track-item').forEach(el => {
      el.classList.toggle('streaming', el.dataset.videoId === videoId);
    });
    document.title = `${title} — YouTube Music | Alkan Player`;
  } catch (err) {
    showToast('Çalma hatası: ' + err.message, 'error');
  }
}

// --- Playlist Detail ---
async function openYtPlaylistDetail(browseId, title) {
  const detail = $('#ytmusic-playlist-detail');
  const shelves = $('#ytmusic-shelves');
  const searchResults = $('#ytmusic-search-results');

  shelves.classList.add('hidden');
  searchResults.classList.add('hidden');
  detail.classList.remove('hidden');

  $('#ytmusic-pl-title').textContent = title || 'Yükleniyor...';
  $('#ytmusic-pl-subtitle').textContent = '';
  $('#ytmusic-pl-thumb').innerHTML = '';
  $('#ytmusic-pl-tracks').innerHTML = '<div class="ytmusic-loading"><div class="download-spinner"></div><span>Şarkılar yükleniyor...</span></div>';

  const data = await window.electronAPI.ytMusicGetPlaylist(browseId);

  if (data.error) {
    $('#ytmusic-pl-tracks').innerHTML = `<div class="ytmusic-empty">Yüklenemedi: ${data.error}</div>`;
    return;
  }

  if (data.title) $('#ytmusic-pl-title').textContent = data.title;
  if (data.subtitle) $('#ytmusic-pl-subtitle').textContent = data.subtitle;
  if (data.thumbnail) $('#ytmusic-pl-thumb').innerHTML = `<img src="${data.thumbnail}" alt="">`;

  if (!data.tracks || data.tracks.length === 0) {
    $('#ytmusic-pl-tracks').innerHTML = '<div class="ytmusic-empty">Bu listede şarkı bulunamadı</div>';
    return;
  }

  const tracksEl = $('#ytmusic-pl-tracks');
  tracksEl.innerHTML = data.tracks.map((t, i) => renderYtTrackItem(t, i)).join('');
  attachYtTrackEvents(tracksEl);
}

function renderYtTrackItem(item, index) {
  const videoId = item.videoId || '';
  return `
    <div class="yt-track-item" data-video-id="${videoId}" data-title="${escapeHtml(item.title)}" data-subtitle="${escapeHtml(item.subtitle)}">
      <div class="yt-track-thumb">
        ${item.thumbnail ? `<img src="${item.thumbnail}" loading="lazy" alt="">` : ''}
      </div>
      <div class="yt-track-info">
        <div class="yt-track-title">${escapeHtml(item.title)}</div>
        <div class="yt-track-subtitle">${escapeHtml(item.subtitle)}</div>
      </div>
      <div class="yt-track-actions">
        ${videoId ? `
          <button class="yt-track-btn yt-btn-play" data-action="stream" title="Dinle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
          </button>
          <button class="yt-track-btn yt-btn-dl" data-action="download" title="İndir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>`;
}

function attachYtTrackEvents(container) {
  container.querySelectorAll('.yt-track-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const track = btn.closest('.yt-track-item');
      const videoId = track.dataset.videoId;
      const title = track.dataset.title;
      if (!videoId) return;

      if (btn.dataset.action === 'stream') {
        const thumb = track.querySelector('img')?.src || '';
        streamYtVideo(videoId, title, thumb);
      } else if (btn.dataset.action === 'download') {
        btn.classList.add('loading');
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        showToast(`"${title}" indiriliyor...`, 'info');
        const result = await window.electronAPI.youtubeDownload(url);
        btn.classList.remove('loading');
        if (result.success) {
          showToast(`"${result.title}" indirildi!`, 'success');
          state.downloads.push(result);
          renderDownloads();
          await addFilesToLibrary([result.filePath]);
        } else {
          showToast(`İndirme hatası: ${result.error}`, 'error');
        }
      }
    });
  });

  // Double-click row to stream
  container.querySelectorAll('.yt-track-item').forEach(track => {
    track.addEventListener('dblclick', () => {
      const videoId = track.dataset.videoId;
      if (videoId) {
        streamYtVideo(videoId, track.dataset.title, track.querySelector('img')?.src || '');
      }
    });
  });
}

$('#btn-ytmusic-back')?.addEventListener('click', () => {
  $('#ytmusic-playlist-detail').classList.add('hidden');
  $('#ytmusic-shelves').classList.remove('hidden');
});

// YT Music search
let ytSearchTimeout = null;
$('#ytmusic-search-input')?.addEventListener('input', (e) => {
  clearTimeout(ytSearchTimeout);
  const query = e.target.value.trim();
  if (!query) {
    $('#ytmusic-search-results').classList.add('hidden');
    $('#ytmusic-playlist-detail')?.classList.add('hidden');
    $('#ytmusic-shelves').classList.remove('hidden');
    return;
  }
  ytSearchTimeout = setTimeout(() => ytMusicSearch(query), 500);
});

$('#ytmusic-search-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(ytSearchTimeout);
    const query = e.target.value.trim();
    if (query) ytMusicSearch(query);
  }
});

async function ytMusicSearch(query) {
  const resultsSection = $('#ytmusic-search-results');
  const grid = $('#ytmusic-search-grid');
  const shelves = $('#ytmusic-shelves');

  resultsSection.classList.remove('hidden');
  shelves.classList.add('hidden');
  grid.innerHTML = '<div class="ytmusic-loading"><div class="download-spinner"></div><span>Aranıyor...</span></div>';

  const data = await window.electronAPI.ytMusicSearch(query);

  if (!data.results || data.results.length === 0) {
    grid.innerHTML = '<div class="ytmusic-empty">Sonuç bulunamadı</div>';
    return;
  }

  grid.innerHTML = data.results.map(item => renderYtCard(item)).join('');
  attachYtCardEvents(grid);
}

// Refresh
$('#btn-yt-refresh')?.addEventListener('click', () => {
  ytMusicLoaded = false;
  const shelvesEl = $('#ytmusic-shelves');
  shelvesEl.innerHTML = '<div class="ytmusic-loading" id="ytmusic-loading"><div class="download-spinner"></div><span>Öneriler yükleniyor...</span></div>';
  $('#ytmusic-search-results')?.classList.add('hidden');
  $('#ytmusic-playlist-detail')?.classList.add('hidden');
  $('#ytmusic-shelves')?.classList.remove('hidden');
  if ($('#ytmusic-search-input')) $('#ytmusic-search-input').value = '';
  loadYtMusicHome();
});

// --- Equalizer ---
const EQ_PRESETS = {
  flat:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock:      [5, 4, 3, 1, -1, 1, 3, 4, 5, 5],
  pop:       [-1, 2, 4, 5, 4, 1, -1, -2, -1, -1],
  jazz:      [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  bass:      [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal:     [-2, -1, 0, 2, 5, 5, 3, 1, 0, -2],
};

els.eqPreset.addEventListener('change', () => {
  const preset = EQ_PRESETS[els.eqPreset.value];
  if (!preset) return;
  const sliders = $$('.eq-slider');
  sliders.forEach((slider, i) => {
    slider.value = preset[i];
    if (eqFilters[i]) eqFilters[i].gain.value = preset[i];
  });
});

$$('.eq-slider').forEach((slider, i) => {
  slider.addEventListener('input', () => {
    if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(slider.value);
  });
});

// --- Visualizer ---
let animFrameId = null;

function startVisualizer() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  const canvas = els.canvas;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  resize();
  window.addEventListener('resize', resize);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, w, h);

    // Draw frequency bars with gradient
    const barCount = 64;
    const barWidth = w / barCount;
    const gap = 2;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(i * bufferLength / barCount);
      const value = dataArray[dataIndex] / 255;
      const barHeight = value * h * 0.9;

      const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight);
      gradient.addColorStop(0, 'rgba(168, 85, 247, 0.6)');
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.4)');
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0.3)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      const x = i * barWidth + gap / 2;
      const radius = Math.min(barWidth - gap, 3);
      ctx.roundRect(x, h - barHeight, barWidth - gap, barHeight, [radius, radius, 0, 0]);
      ctx.fill();
    }

    // Mirror effect (subtle)
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.scale(1, -1);
    ctx.translate(0, -h * 2);
    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor(i * bufferLength / barCount);
      const value = dataArray[dataIndex] / 255;
      const barHeight = value * h * 0.3;

      const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight);
      gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0.1)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      const x = i * barWidth + gap / 2;
      ctx.roundRect(x, h - barHeight, barWidth - gap, barHeight, [2, 2, 0, 0]);
      ctx.fill();
    }
    ctx.restore();
  }

  draw();
}

// --- VU Meter (TASCAM 112mkII Style) ---
let vuAnimId = null;
let vuLevelL = 0, vuLevelR = 0;
let vuPeakHoldL = 0, vuPeakHoldR = 0;
let vuPeakTimerL = 0, vuPeakTimerR = 0;

function startVuMeter() {
  if (vuAnimId) cancelAnimationFrame(vuAnimId);
  const canvas = els.vuCanvas;
  if (!canvas || !analyserL || !analyserR) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 340, H = 96;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const bufL = new Uint8Array(analyserL.frequencyBinCount);
  const bufR = new Uint8Array(analyserR.frequencyBinCount);

  function getRMS(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  let glowPhase = 0;

  function drawTascamMeter(ctx, x, y, w, h, level, peakLed, label) {
    const cx = x + w / 2;
    const pivotY = y + h + 8;
    const R = h - 2;
    const startA = Math.PI + 0.22;
    const sweep = Math.PI - 0.44;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.clip();

    // Black matte background
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(x, y, w, h);

    // Warm amber backlight glow from behind the scale
    const glowStr = 0.12 + 0.03 * Math.sin(glowPhase * 0.6);
    const lampGlow = ctx.createRadialGradient(cx, pivotY - R * 0.55, 0, cx, pivotY - R * 0.55, R * 1.1);
    lampGlow.addColorStop(0, `rgba(255, 195, 50, ${glowStr + level * 0.15})`);
    lampGlow.addColorStop(0.5, `rgba(255, 170, 30, ${glowStr * 0.4})`);
    lampGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lampGlow;
    ctx.fillRect(x, y, w, h);

    // Scale arc
    ctx.beginPath();
    ctx.arc(cx, pivotY, R, startA, startA + sweep);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();

    // dB markings — TASCAM style
    const marks = [
      { v: 0.00, lbl: '-20', major: true, zone: 'green' },
      { v: 0.08, lbl: '',    major: false, zone: 'green' },
      { v: 0.16, lbl: '-10', major: true, zone: 'green' },
      { v: 0.24, lbl: '',    major: false, zone: 'green' },
      { v: 0.32, lbl: '-7',  major: false, zone: 'green' },
      { v: 0.42, lbl: '-5',  major: true,  zone: 'green' },
      { v: 0.52, lbl: '-3',  major: false, zone: 'green' },
      { v: 0.62, lbl: '-1',  major: false, zone: 'yellow' },
      { v: 0.70, lbl: '0',   major: true,  zone: 'yellow' },
      { v: 0.78, lbl: '+1',  major: false, zone: 'red' },
      { v: 0.86, lbl: '+2',  major: false, zone: 'red' },
      { v: 0.94, lbl: '+3',  major: true,  zone: 'red' },
    ];

    const zoneColors = {
      green:  '#3ddc84',
      yellow: '#fbbf24',
      red:    '#ef4444',
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const m of marks) {
      const a = startA + m.v * sweep;
      const outerR = R + 1;
      const tickLen = m.major ? 8 : 4.5;
      const col = zoneColors[m.zone];

      const ox = cx + Math.cos(a) * outerR;
      const oy = pivotY + Math.sin(a) * outerR;
      const ix = cx + Math.cos(a) * (outerR - tickLen);
      const iy = pivotY + Math.sin(a) * (outerR - tickLen);

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ix, iy);
      ctx.lineWidth = m.major ? 1.5 : 0.8;
      ctx.strokeStyle = col;
      ctx.globalAlpha = m.major ? 0.9 : 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (m.lbl) {
        const lr = outerR - tickLen - 9;
        const lx = cx + Math.cos(a) * lr;
        const ly = pivotY + Math.sin(a) * lr;
        ctx.font = m.major ? 'bold 9px "Courier New", monospace' : '7.5px "Courier New", monospace';
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fillText(m.lbl, lx, ly);
        ctx.globalAlpha = 1;
      }
    }

    // Colored zone arcs
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, pivotY, R - 4, startA, startA + 0.58 * sweep);
    ctx.strokeStyle = 'rgba(61, 220, 132, 0.2)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, pivotY, R - 4, startA + 0.58 * sweep, startA + 0.72 * sweep);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, pivotY, R - 4, startA + 0.72 * sweep, startA + sweep);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.stroke();

    // "VU" text
    ctx.font = 'italic 10px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255, 195, 50, 0.45)';
    ctx.fillText('VU', cx, pivotY - R * 0.32);

    // --- Needle ---
    const clamped = Math.min(1, Math.max(0, level));
    const needleA = startA + clamped * sweep;
    const needleLen = R - 1;

    // Needle shadow
    ctx.save();
    ctx.translate(cx + 0.7, pivotY + 0.7);
    ctx.rotate(needleA);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(needleLen, 0);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.restore();

    // White needle (tapered)
    ctx.save();
    ctx.translate(cx, pivotY);
    ctx.rotate(needleA);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(needleLen * 0.7, 0);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(needleLen * 0.7, 0);
    ctx.lineTo(needleLen, 0);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // Pivot (dark metallic)
    const pivGrad = ctx.createRadialGradient(cx - 0.5, pivotY - 0.5, 0, cx, pivotY, 3.5);
    pivGrad.addColorStop(0, '#666');
    pivGrad.addColorStop(0.5, '#444');
    pivGrad.addColorStop(1, '#222');
    ctx.beginPath();
    ctx.arc(cx, pivotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = pivGrad;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    // Peak LED
    const ledX = x + w - 8;
    const ledY = y + 7;
    if (peakLed > 0.68) {
      const ledGlow = ctx.createRadialGradient(ledX, ledY, 0, ledX, ledY, 6);
      ledGlow.addColorStop(0, 'rgba(255, 50, 30, 0.9)');
      ledGlow.addColorStop(0.5, 'rgba(255, 30, 20, 0.3)');
      ledGlow.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = ledGlow;
      ctx.fillRect(ledX - 6, ledY - 6, 12, 12);
      ctx.beginPath();
      ctx.arc(ledX, ledY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3020';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(ledX, ledY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#331010';
      ctx.fill();
    }
    ctx.font = '6px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('PEAK', ledX, ledY + 8);

    // Channel label
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255, 195, 50, 0.55)';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, y + h - 3);

    ctx.restore();
  }

  function vuDraw() {
    vuAnimId = requestAnimationFrame(vuDraw);
    glowPhase += 0.04;

    analyserL.getByteTimeDomainData(bufL);
    analyserR.getByteTimeDomainData(bufR);

    const rawL = getRMS(bufL);
    const rawR = getRMS(bufR);

    const dbL = Math.max(0, 1 + Math.log10(Math.max(rawL, 0.001)) / 2);
    const dbR = Math.max(0, 1 + Math.log10(Math.max(rawR, 0.001)) / 2);

    const attack = 0.18, release = 0.05;
    vuLevelL += (dbL > vuLevelL ? attack : release) * (dbL - vuLevelL);
    vuLevelR += (dbR > vuLevelR ? attack : release) * (dbR - vuLevelR);

    if (vuLevelL > vuPeakHoldL) { vuPeakHoldL = vuLevelL; vuPeakTimerL = 0; }
    else { vuPeakTimerL++; if (vuPeakTimerL > 30) vuPeakHoldL -= 0.02; }
    if (vuLevelR > vuPeakHoldR) { vuPeakHoldR = vuLevelR; vuPeakTimerR = 0; }
    else { vuPeakTimerR++; if (vuPeakTimerR > 30) vuPeakHoldR -= 0.02; }

    ctx.clearRect(0, 0, W, H);

    // Dark charcoal housing — TASCAM faceplate
    const housingGrad = ctx.createLinearGradient(0, 0, 0, H);
    housingGrad.addColorStop(0, '#1a1a1e');
    housingGrad.addColorStop(0.5, '#141416');
    housingGrad.addColorStop(1, '#101012');
    ctx.fillStyle = housingGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 5);
    ctx.fill();

    // Brushed metal texture
    ctx.save();
    ctx.globalAlpha = 0.02;
    for (let i = 0; i < W; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Divider between L and R
    ctx.beginPath();
    ctx.moveTo(W / 2, 4);
    ctx.lineTo(W / 2, H - 4);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 195, 50, 0.08)';
    ctx.stroke();

    // L and R meters
    const mW = W / 2 - 6;
    drawTascamMeter(ctx, 4, 2, mW, H - 4, vuLevelL, vuPeakHoldL, 'L');
    drawTascamMeter(ctx, W / 2 + 2, 2, mW, H - 4, vuLevelR, vuPeakHoldR, 'R');

    // Outer bezel
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 5);
    ctx.lineWidth = 1;
    const bezel = ctx.createLinearGradient(0, 0, 0, H);
    bezel.addColorStop(0, 'rgba(80, 80, 90, 0.5)');
    bezel.addColorStop(0.5, 'rgba(40, 40, 45, 0.3)');
    bezel.addColorStop(1, 'rgba(20, 20, 22, 0.5)');
    ctx.strokeStyle = bezel;
    ctx.stroke();

    // Inner bevel highlight
    ctx.beginPath();
    ctx.roundRect(1, 1, W - 2, H - 2, 4);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.stroke();
  }

  vuDraw();
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowRight':
      if (e.ctrlKey) playNext();
      else if (audioElement.duration) audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + 5);
      break;
    case 'ArrowLeft':
      if (e.ctrlKey) playPrev();
      else if (audioElement.duration) audioElement.currentTime = Math.max(0, audioElement.currentTime - 5);
      break;
    case 'ArrowUp':
      setVolume(Math.min(1, state.volume + 0.05));
      break;
    case 'ArrowDown':
      setVolume(Math.max(0, state.volume - 0.05));
      break;
    case 'KeyF':
      if (e.ctrlKey) {
        e.preventDefault();
        els.searchInput.focus();
      }
      break;
  }
});

// --- Drag & Drop ---
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = Array.from(e.dataTransfer.files)
    .filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.aiff'].includes(ext);
    })
    .map(f => f.path);
  if (files.length > 0) addFilesToLibrary(files);
});

// --- Settings ---
async function loadSettings() {
  state.settings = await window.electronAPI.loadSettings();
}

async function saveSettingsToFile() {
  await window.electronAPI.saveSettings(state.settings);
}

function renderSettings() {
  const pathEl = $('#settings-download-path');
  const dataPathEl = $('#settings-data-path');
  const countEl = $('#settings-library-count');
  if (pathEl) pathEl.textContent = state.settings.downloadPath || 'Varsayılan';
  if (dataPathEl) {
    window.electronAPI.getDataPath().then(p => { dataPathEl.textContent = p; });
  }
  if (countEl) countEl.textContent = `${state.library.length} şarkı`;
}

$('#btn-change-download-path').addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    state.settings.downloadPath = folder;
    await saveSettingsToFile();
    renderSettings();
    showToast('İndirme klasörü güncellendi', 'success');
  }
});

$('#btn-change-data-path').addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    state.settings.dataPath = folder;
    await saveSettingsToFile();
    renderSettings();
    showToast('Veri klasörü güncellendi. Değişiklik uygulandı.', 'success');
  }
});

$('#btn-clear-library').addEventListener('click', () => {
  if (state.library.length === 0) {
    showToast('Kütüphane zaten boş', 'info');
    return;
  }
  showModal('Kütüphaneyi Temizle', '', (val) => {
    state.library = [];
    saveLibrary();
    renderTrackList();
    renderSettings();
    showToast('Kütüphane temizlendi', 'success');
  }, 'Tüm şarkılar kütüphaneden kaldırılacak. Dosyalar silinmez. Devam etmek istiyor musunuz?', 'Temizle');
});

// --- Init ---
async function init() {
  audioElement.volume = state.volume;
  els.volumeSlider.value = state.volume * 100;
  drawVolumeKnob();
  await loadSettings();
  await loadLibrary();
  await loadPlaylists();
  renderDownloads();
  renderTrackList();
}

init();
