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
  playQueue: null,
  librarySort: 'added',
  libraryView: 'detailed',
  searchQuery: '',
  downloads: [],
  settings: {
    downloadPath: '',
    dataPath: '',
    theme: 'dark',
    language: 'tr',
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
  sortBtn: $('#btn-sort'),
  viewToggleBtn: $('#btn-view-toggle'),
  youtubeUrl: $('#youtube-url'),
  downloadStatus: $('#download-status'),
  downloadList: $('#download-list'),
  eqPreset: $('#eq-preset'),
  eqPresetChips: $('#eq-preset-chips'),
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

const translations = {
  tr: {
    'app.name': 'Alkan Player',
    'nav.library': 'Kütüphane',
    'nav.playlists': 'Çalma Listeleri',
    'nav.youtube': 'YouTube',
    'nav.ytmusic': 'YT Music',
    'nav.equalizer': 'Equalizer',
    'nav.settings': 'Ayarlar',
    'nav.addFiles': 'Dosya Ekle',
    'nav.addFolder': 'Klasör Ekle',
    'search.placeholder': 'Şarkı, sanatçı veya albüm ara...',
    'view.library': 'Kütüphane',
    'view.playlists': 'Çalma Listeleri',
    'view.youtube': 'YouTube İndir',
    'view.ytmusic': 'YouTube Music',
    'view.equalizer': 'Equalizer',
    'view.settings': 'Ayarlar',
    'playlist.new': 'Yeni Liste',
    'playlist.remove': 'Listeden kaldır',
    'playlist.emptyTitle': 'Henüz çalma listesi yok',
    'playlist.emptySub': 'Yeni bir çalma listesi oluşturun',
    'playlist.detailEmptyTitle': 'Bu listede şarkı yok',
    'playlist.detailEmptySub': 'Kütüphaneden şarkı ekleyin',
    'playlist.addTo': 'Çalma Listesine Ekle',
    'youtube.urlPlaceholder': 'YouTube URL yapıştırın...',
    'youtube.download': 'İndir',
    'youtube.downloading': 'İndiriliyor...',
    'youtube.downloadingLong': 'İndiriliyor... Bu biraz zaman alabilir.',
    'youtube.downloaded': 'İndirilen Şarkılar',
    'youtube.noDownloads': 'Henüz indirme yok',
    'ytmusic.loginTitle': "YouTube Music'e Bağlan",
    'ytmusic.loginDesc': 'Kişiselleştirilmiş önerilerinizi görmek için Google hesabınızla giriş yapın',
    'ytmusic.loginButton': 'Google ile Giriş Yap',
    'ytmusic.loginHeader': 'Google hesabınızla giriş yapın',
    'ytmusic.loginDone': 'Giriş Tamamlandı',
    'ytmusic.searchPlaceholder': "YouTube Music'te şarkı ara...",
    'ytmusic.searchResults': 'Arama Sonuçları',
    'ytmusic.recommendationsLoading': 'Öneriler yükleniyor...',
    'ytmusic.noRecommendations': 'Öneri bulunamadı. Sayfayı yenilemeyi deneyin.',
    'ytmusic.loadingTracks': 'Şarkılar yükleniyor...',
    'ytmusic.emptyPlaylist': 'Bu listede şarkı bulunamadı',
    'ytmusic.loadFailed': ({ error }) => `Yüklenemedi: ${error}`,
    'ytmusic.searching': 'Aranıyor...',
    'ytmusic.noResults': 'Sonuç bulunamadı',
    'ytmusic.listen': 'Dinle',
    'ytmusic.downloadAction': 'İndir',
    'ytmusic.browse': 'Göz At',
    'ytmusic.badge.playlist': 'Liste',
    'ytmusic.badge.album': 'Albüm',
    'ytmusic.badge.song': 'Şarkı',
    'eq.flat': 'Düz',
    'eq.rock': 'Rock',
    'eq.pop': 'Pop',
    'eq.jazz': 'Jazz',
    'eq.classical': 'Klasik',
    'eq.bass': 'Bass Boost',
    'eq.vocal': 'Vokal',
    'settings.appearance': 'Görünüm',
    'settings.theme': 'Tema',
    'settings.themeDesc': 'Uygulamanın genel görünümünü seçin',
    'settings.language': 'Dil',
    'settings.languageDesc': 'Uygulama dilini değiştirin',
    'settings.downloads': 'İndirme Ayarları',
    'settings.downloadPath': 'İndirme Klasörü',
    'settings.downloadDesc': "YouTube'dan indirilen müziklerin kaydedileceği klasör",
    'settings.data': 'Veri Dosyaları',
    'settings.dataPath': 'Veri Klasörü',
    'settings.dataDesc': 'Kütüphane ve çalma listesi verilerinin saklandığı klasör',
    'settings.library': 'Kütüphane',
    'settings.libraryCount': 'Kütüphanedeki Şarkı Sayısı',
    'settings.clearLibrary': 'Kütüphaneyi Temizle',
    'settings.clearLibraryDesc': 'Tüm şarkıları kütüphaneden kaldır (dosyalar silinmez)',
    'settings.about': 'Hakkında',
    'settings.aboutDesc': 'Versiyon 1.5.2 — Modern müzik oynatıcı',
    'theme.dark': 'Koyu',
    'theme.light': 'Açık',
    'theme.ocean': 'Okyanus',
    'theme.amber': 'Amber',
    'theme.forest': 'Orman',
    'theme.mono': 'Monokrom',
    'lang.tr': 'Türkçe',
    'lang.en': 'English',
    'lang.ar': 'العربية',
    'lang.it': 'Italiano',
    'window.minimize': 'Küçült',
    'window.maximize': 'Büyüt',
    'window.close': 'Kapat',
    'tooltip.sort': 'Sırala',
    'tooltip.viewToggle': 'Görünüm',
    'tooltip.refresh': 'Yenile',
    'tooltip.shuffle': 'Karışık',
    'tooltip.prev': 'Önceki',
    'tooltip.playPause': 'Çal/Duraklat',
    'tooltip.next': 'Sonraki',
    'tooltip.repeat': 'Tekrarla',
    'tooltip.volume': 'Ses',
    'context.play': '▶ Çal',
    'context.addToPlaylist': '📋 Listeye Ekle',
    'context.remove': '🗑 Kaldır',
    'context.reveal': '📁 Dosya Konumunu Aç',
    'player.selectSong': 'Şarkı seçin',
    'common.change': 'Değiştir',
    'common.delete': 'Sil',
    'common.clear': 'Temizle',
    'common.cancel': 'İptal',
    'common.create': 'Oluştur',
    'common.confirm': 'Onayla',
    'common.back': 'Geri',
    'common.loading': 'Yükleniyor...',
    'common.unknownArtist': 'Bilinmeyen Sanatçı',
    'common.unknownAlbum': 'Bilinmeyen Albüm',
    'common.default': 'Varsayılan',
    'common.songCount': ({ count }) => `${count} şarkı`,
    'empty.noMusic': 'Henüz müzik eklenmedi',
    'empty.noMusicSub': 'Dosya veya klasör ekleyerek başlayın',
    'empty.noResults': 'Sonuç bulunamadı',
    'empty.noResultsSub': 'Farklı bir arama deneyin',
    'toast.addedSongs': ({ count }) => `${count} şarkı eklendi`,
    'toast.shuffleOn': 'Karışık: Açık',
    'toast.shuffleOff': 'Karışık: Kapalı',
    'toast.repeatOff': 'Tekrar: Kapalı',
    'toast.repeatAll': 'Tümünü Tekrarla',
    'toast.repeatOne': 'Birini Tekrarla',
    'toast.playbackError': ({ message }) => `Çalma hatası: ${message}`,
    'toast.songRemoved': 'Şarkı kaldırıldı',
    'toast.addPlaylistFirst': 'Önce bir çalma listesi oluşturun',
    'toast.addedToPlaylist': ({ name }) => `"${name}" listesine eklendi`,
    'toast.alreadyInPlaylist': 'Şarkı zaten listede',
    'toast.playlistDeleted': 'Çalma listesi silindi',
    'toast.playlistCreated': ({ name }) => `"${name}" listesi oluşturuldu`,
    'toast.downloadUrlMissing': 'Lütfen bir YouTube URL girin',
    'toast.downloadUrlInvalid': 'Geçerli bir YouTube URL girin',
    'toast.downloadSuccess': ({ title }) => `"${title}" indirildi!`,
    'toast.downloadError': ({ error }) => `İndirme hatası: ${error}`,
    'toast.downloadingTitle': ({ title }) => `"${title}" indiriliyor...`,
    'toast.streamError': ({ error }) => `Akış alınamadı: ${error}`,
    'toast.streamLoading': 'Şarkı yükleniyor...',
    'toast.ytmusicConnected': "YouTube Music'e bağlandınız!",
    'toast.ytmusicNotLogged': 'Henüz giriş yapılmadı. Lütfen Google hesabınızla giriş yapın.',
    'toast.downloadPathUpdated': 'İndirme klasörü güncellendi',
    'toast.dataPathUpdated': 'Veri klasörü güncellendi. Değişiklik uygulandı.',
    'toast.libraryEmpty': 'Kütüphane zaten boş',
    'toast.libraryCleared': 'Kütüphane temizlendi',
    'toast.playlistRemoved': 'Listeden kaldırıldı',
    'toast.themeUpdated': 'Tema güncellendi',
    'toast.languageUpdated': 'Dil güncellendi',
    'toast.sortAdded': 'Sıralama: Eklenme',
    'toast.sortTitle': 'Sıralama: Şarkı Adı',
    'toast.sortArtist': 'Sıralama: Sanatçı',
    'toast.sortAlbum': 'Sıralama: Albüm',
    'toast.viewDetailed': 'Görünüm: Detaylı',
    'toast.viewCompact': 'Görünüm: Kompakt',
    'modal.newPlaylistTitle': 'Yeni Çalma Listesi',
    'modal.newPlaylistPlaceholder': 'Liste adı...',
    'modal.clearLibraryTitle': 'Kütüphaneyi Temizle',
    'modal.clearLibraryConfirm': 'Tüm şarkılar kütüphaneden kaldırılacak. Dosyalar silinmez. Devam etmek istiyor musunuz?',
  },
  en: {
    'app.name': 'Alkan Player',
    'nav.library': 'Library',
    'nav.playlists': 'Playlists',
    'nav.youtube': 'YouTube',
    'nav.ytmusic': 'YT Music',
    'nav.equalizer': 'Equalizer',
    'nav.settings': 'Settings',
    'nav.addFiles': 'Add Files',
    'nav.addFolder': 'Add Folder',
    'search.placeholder': 'Search songs, artists, or albums...',
    'view.library': 'Library',
    'view.playlists': 'Playlists',
    'view.youtube': 'YouTube Download',
    'view.ytmusic': 'YouTube Music',
    'view.equalizer': 'Equalizer',
    'view.settings': 'Settings',
    'playlist.new': 'New Playlist',
    'playlist.remove': 'Remove from playlist',
    'playlist.emptyTitle': 'No playlists yet',
    'playlist.emptySub': 'Create a new playlist',
    'playlist.detailEmptyTitle': 'No songs in this playlist',
    'playlist.detailEmptySub': 'Add songs from the library',
    'playlist.addTo': 'Add to Playlist',
    'youtube.urlPlaceholder': 'Paste YouTube URL...',
    'youtube.download': 'Download',
    'youtube.downloading': 'Downloading...',
    'youtube.downloadingLong': 'Downloading... This may take a while.',
    'youtube.downloaded': 'Downloaded Songs',
    'youtube.noDownloads': 'No downloads yet',
    'ytmusic.loginTitle': 'Connect to YouTube Music',
    'ytmusic.loginDesc': 'Sign in with your Google account to see personalized recommendations',
    'ytmusic.loginButton': 'Sign in with Google',
    'ytmusic.loginHeader': 'Sign in with your Google account',
    'ytmusic.loginDone': 'Login Complete',
    'ytmusic.searchPlaceholder': 'Search songs on YouTube Music...',
    'ytmusic.searchResults': 'Search Results',
    'ytmusic.recommendationsLoading': 'Loading recommendations...',
    'ytmusic.noRecommendations': 'No recommendations found. Try refreshing.',
    'ytmusic.loadingTracks': 'Loading tracks...',
    'ytmusic.emptyPlaylist': 'No songs found in this playlist',
    'ytmusic.loadFailed': ({ error }) => `Failed to load: ${error}`,
    'ytmusic.searching': 'Searching...',
    'ytmusic.noResults': 'No results found',
    'ytmusic.listen': 'Listen',
    'ytmusic.downloadAction': 'Download',
    'ytmusic.browse': 'Browse',
    'ytmusic.badge.playlist': 'Playlist',
    'ytmusic.badge.album': 'Album',
    'ytmusic.badge.song': 'Song',
    'eq.flat': 'Flat',
    'eq.rock': 'Rock',
    'eq.pop': 'Pop',
    'eq.jazz': 'Jazz',
    'eq.classical': 'Classical',
    'eq.bass': 'Bass Boost',
    'eq.vocal': 'Vocal',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.themeDesc': 'Choose the overall look of the app',
    'settings.language': 'Language',
    'settings.languageDesc': 'Change the app language',
    'settings.downloads': 'Download Settings',
    'settings.downloadPath': 'Download Folder',
    'settings.downloadDesc': 'Folder where YouTube downloads are saved',
    'settings.data': 'Data Files',
    'settings.dataPath': 'Data Folder',
    'settings.dataDesc': 'Folder where library and playlist data are stored',
    'settings.library': 'Library',
    'settings.libraryCount': 'Songs in Library',
    'settings.clearLibrary': 'Clear Library',
    'settings.clearLibraryDesc': 'Remove all songs from the library (files are not deleted)',
    'settings.about': 'About',
    'settings.aboutDesc': 'Version 1.5.2 — Modern music player',
    'theme.dark': 'Dark',
    'theme.light': 'Light',
    'theme.ocean': 'Ocean',
    'theme.amber': 'Amber',
    'theme.forest': 'Forest',
    'theme.mono': 'Monochrome',
    'lang.tr': 'Turkish',
    'lang.en': 'English',
    'lang.ar': 'Arabic',
    'lang.it': 'Italian',
    'window.minimize': 'Minimize',
    'window.maximize': 'Maximize',
    'window.close': 'Close',
    'tooltip.sort': 'Sort',
    'tooltip.viewToggle': 'View',
    'tooltip.refresh': 'Refresh',
    'tooltip.shuffle': 'Shuffle',
    'tooltip.prev': 'Previous',
    'tooltip.playPause': 'Play/Pause',
    'tooltip.next': 'Next',
    'tooltip.repeat': 'Repeat',
    'tooltip.volume': 'Volume',
    'context.play': '▶ Play',
    'context.addToPlaylist': '📋 Add to Playlist',
    'context.remove': '🗑 Remove',
    'context.reveal': '📁 Show in Folder',
    'player.selectSong': 'Select a song',
    'common.change': 'Change',
    'common.delete': 'Delete',
    'common.clear': 'Clear',
    'common.cancel': 'Cancel',
    'common.create': 'Create',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.loading': 'Loading...',
    'common.unknownArtist': 'Unknown Artist',
    'common.unknownAlbum': 'Unknown Album',
    'common.default': 'Default',
    'common.songCount': ({ count }) => `${count} ${count === 1 ? 'song' : 'songs'}`,
    'empty.noMusic': 'No music added yet',
    'empty.noMusicSub': 'Start by adding files or folders',
    'empty.noResults': 'No results found',
    'empty.noResultsSub': 'Try a different search',
    'toast.addedSongs': ({ count }) => `Added ${count} ${count === 1 ? 'song' : 'songs'}`,
    'toast.shuffleOn': 'Shuffle: On',
    'toast.shuffleOff': 'Shuffle: Off',
    'toast.repeatOff': 'Repeat: Off',
    'toast.repeatAll': 'Repeat All',
    'toast.repeatOne': 'Repeat One',
    'toast.playbackError': ({ message }) => `Playback error: ${message}`,
    'toast.songRemoved': 'Song removed',
    'toast.addPlaylistFirst': 'Create a playlist first',
    'toast.addedToPlaylist': ({ name }) => `Added to "${name}"`,
    'toast.alreadyInPlaylist': 'Song is already in the playlist',
    'toast.playlistDeleted': 'Playlist deleted',
    'toast.playlistCreated': ({ name }) => `Playlist "${name}" created`,
    'toast.downloadUrlMissing': 'Please enter a YouTube URL',
    'toast.downloadUrlInvalid': 'Enter a valid YouTube URL',
    'toast.downloadSuccess': ({ title }) => `"${title}" downloaded!`,
    'toast.downloadError': ({ error }) => `Download error: ${error}`,
    'toast.downloadingTitle': ({ title }) => `Downloading "${title}"...`,
    'toast.streamError': ({ error }) => `Stream failed: ${error}`,
    'toast.streamLoading': 'Loading track...',
    'toast.ytmusicConnected': 'Connected to YouTube Music!',
    'toast.ytmusicNotLogged': 'Not logged in yet. Please sign in with your Google account.',
    'toast.downloadPathUpdated': 'Download folder updated',
    'toast.dataPathUpdated': 'Data folder updated. Changes applied.',
    'toast.libraryEmpty': 'Library is already empty',
    'toast.libraryCleared': 'Library cleared',
    'toast.playlistRemoved': 'Removed from playlist',
    'toast.themeUpdated': 'Theme updated',
    'toast.languageUpdated': 'Language updated',
    'toast.sortAdded': 'Sort: Added',
    'toast.sortTitle': 'Sort: Title',
    'toast.sortArtist': 'Sort: Artist',
    'toast.sortAlbum': 'Sort: Album',
    'toast.viewDetailed': 'View: Detailed',
    'toast.viewCompact': 'View: Compact',
    'modal.newPlaylistTitle': 'New Playlist',
    'modal.newPlaylistPlaceholder': 'Playlist name...',
    'modal.clearLibraryTitle': 'Clear Library',
    'modal.clearLibraryConfirm': 'All songs will be removed from the library. Files will not be deleted. Continue?',
  },
  ar: {
    'app.name': 'Alkan Player',
    'nav.library': 'المكتبة',
    'nav.playlists': 'قوائم التشغيل',
    'nav.youtube': 'يوتيوب',
    'nav.ytmusic': 'YT Music',
    'nav.equalizer': 'المعادل',
    'nav.settings': 'الإعدادات',
    'nav.addFiles': 'إضافة ملفات',
    'nav.addFolder': 'إضافة مجلد',
    'search.placeholder': 'ابحث عن الأغاني أو الفنانين أو الألبومات...',
    'view.library': 'المكتبة',
    'view.playlists': 'قوائم التشغيل',
    'view.youtube': 'تنزيل من يوتيوب',
    'view.ytmusic': 'YouTube Music',
    'view.equalizer': 'المعادل',
    'view.settings': 'الإعدادات',
    'playlist.new': 'قائمة جديدة',
    'playlist.remove': 'إزالة من القائمة',
    'playlist.emptyTitle': 'لا توجد قوائم بعد',
    'playlist.emptySub': 'أنشئ قائمة تشغيل جديدة',
    'playlist.detailEmptyTitle': 'لا توجد أغانٍ في هذه القائمة',
    'playlist.detailEmptySub': 'أضف الأغاني من المكتبة',
    'playlist.addTo': 'إضافة إلى قائمة تشغيل',
    'youtube.urlPlaceholder': 'الصق رابط يوتيوب...',
    'youtube.download': 'تنزيل',
    'youtube.downloading': 'جارٍ التنزيل...',
    'youtube.downloadingLong': 'جارٍ التنزيل... قد يستغرق الأمر بعض الوقت.',
    'youtube.downloaded': 'الأغاني المُنزَّلة',
    'youtube.noDownloads': 'لا توجد تنزيلات بعد',
    'ytmusic.loginTitle': 'الاتصال بـ YouTube Music',
    'ytmusic.loginDesc': 'سجّل الدخول بحساب Google لرؤية التوصيات المخصّصة',
    'ytmusic.loginButton': 'تسجيل الدخول عبر Google',
    'ytmusic.loginHeader': 'سجّل الدخول بحساب Google',
    'ytmusic.loginDone': 'اكتمل تسجيل الدخول',
    'ytmusic.searchPlaceholder': 'ابحث عن أغنية على YouTube Music...',
    'ytmusic.searchResults': 'نتائج البحث',
    'ytmusic.recommendationsLoading': 'جارٍ تحميل التوصيات...',
    'ytmusic.noRecommendations': 'لا توجد توصيات. جرّب التحديث.',
    'ytmusic.loadingTracks': 'جارٍ تحميل الأغاني...',
    'ytmusic.emptyPlaylist': 'لا توجد أغانٍ في هذه القائمة',
    'ytmusic.loadFailed': ({ error }) => `تعذر التحميل: ${error}`,
    'ytmusic.searching': 'جارٍ البحث...',
    'ytmusic.noResults': 'لا توجد نتائج',
    'ytmusic.listen': 'استماع',
    'ytmusic.downloadAction': 'تنزيل',
    'ytmusic.browse': 'تصفح',
    'ytmusic.badge.playlist': 'قائمة',
    'ytmusic.badge.album': 'ألبوم',
    'ytmusic.badge.song': 'أغنية',
    'eq.flat': 'مسطح',
    'eq.rock': 'روك',
    'eq.pop': 'بوب',
    'eq.jazz': 'جاز',
    'eq.classical': 'كلاسيكي',
    'eq.bass': 'تعزيز الباس',
    'eq.vocal': 'غناء',
    'settings.appearance': 'المظهر',
    'settings.theme': 'السمة',
    'settings.themeDesc': 'اختر المظهر العام للتطبيق',
    'settings.language': 'اللغة',
    'settings.languageDesc': 'غيّر لغة التطبيق',
    'settings.downloads': 'إعدادات التنزيل',
    'settings.downloadPath': 'مجلد التنزيل',
    'settings.downloadDesc': 'المجلد الذي تُحفظ فيه تنزيلات YouTube',
    'settings.data': 'ملفات البيانات',
    'settings.dataPath': 'مجلد البيانات',
    'settings.dataDesc': 'المجلد الذي تُحفظ فيه بيانات المكتبة وقوائم التشغيل',
    'settings.library': 'المكتبة',
    'settings.libraryCount': 'عدد الأغاني في المكتبة',
    'settings.clearLibrary': 'مسح المكتبة',
    'settings.clearLibraryDesc': 'إزالة جميع الأغاني من المكتبة (لن تُحذف الملفات)',
    'settings.about': 'حول',
    'settings.aboutDesc': 'الإصدار 1.5.2 — مشغل موسيقى حديث',
    'theme.dark': 'داكن',
    'theme.light': 'فاتح',
    'theme.ocean': 'محيط',
    'theme.amber': 'كهرماني',
    'theme.forest': 'غابة',
    'theme.mono': 'أحادي اللون',
    'lang.tr': 'التركية',
    'lang.en': 'الإنجليزية',
    'lang.ar': 'العربية',
    'lang.it': 'الإيطالية',
    'window.minimize': 'تصغير',
    'window.maximize': 'تكبير',
    'window.close': 'إغلاق',
    'tooltip.sort': 'ترتيب',
    'tooltip.viewToggle': 'عرض',
    'tooltip.refresh': 'تحديث',
    'tooltip.shuffle': 'عشوائي',
    'tooltip.prev': 'السابق',
    'tooltip.playPause': 'تشغيل/إيقاف',
    'tooltip.next': 'التالي',
    'tooltip.repeat': 'تكرار',
    'tooltip.volume': 'الصوت',
    'context.play': '▶ تشغيل',
    'context.addToPlaylist': '📋 إضافة إلى قائمة تشغيل',
    'context.remove': '🗑 إزالة',
    'context.reveal': '📁 إظهار في المجلد',
    'player.selectSong': 'اختر أغنية',
    'common.change': 'تغيير',
    'common.delete': 'حذف',
    'common.clear': 'مسح',
    'common.cancel': 'إلغاء',
    'common.create': 'إنشاء',
    'common.confirm': 'تأكيد',
    'common.back': 'رجوع',
    'common.loading': 'جارٍ التحميل...',
    'common.unknownArtist': 'فنان غير معروف',
    'common.unknownAlbum': 'ألبوم غير معروف',
    'common.default': 'افتراضي',
    'common.songCount': ({ count }) => `${count} أغنية`,
    'empty.noMusic': 'لم تتم إضافة موسيقى بعد',
    'empty.noMusicSub': 'ابدأ بإضافة ملفات أو مجلدات',
    'empty.noResults': 'لا توجد نتائج',
    'empty.noResultsSub': 'جرّب بحثًا مختلفًا',
    'toast.addedSongs': ({ count }) => `تمت إضافة ${count} أغنية`,
    'toast.shuffleOn': 'تشغيل عشوائي: تشغيل',
    'toast.shuffleOff': 'تشغيل عشوائي: إيقاف',
    'toast.repeatOff': 'تكرار: إيقاف',
    'toast.repeatAll': 'تكرار الكل',
    'toast.repeatOne': 'تكرار واحد',
    'toast.playbackError': ({ message }) => `خطأ في التشغيل: ${message}`,
    'toast.songRemoved': 'تمت إزالة الأغنية',
    'toast.addPlaylistFirst': 'أنشئ قائمة تشغيل أولاً',
    'toast.addedToPlaylist': ({ name }) => `تمت الإضافة إلى "${name}"`,
    'toast.alreadyInPlaylist': 'الأغنية موجودة بالفعل في القائمة',
    'toast.playlistDeleted': 'تم حذف قائمة التشغيل',
    'toast.playlistCreated': ({ name }) => `تم إنشاء قائمة التشغيل "${name}"`,
    'toast.downloadUrlMissing': 'يرجى إدخال رابط يوتيوب',
    'toast.downloadUrlInvalid': 'أدخل رابط يوتيوب صالح',
    'toast.downloadSuccess': ({ title }) => `تم تنزيل "${title}"`,
    'toast.downloadError': ({ error }) => `خطأ في التنزيل: ${error}`,
    'toast.downloadingTitle': ({ title }) => `جارٍ تنزيل "${title}"...`,
    'toast.streamError': ({ error }) => `فشل البث: ${error}`,
    'toast.streamLoading': 'جارٍ تحميل الأغنية...',
    'toast.ytmusicConnected': 'تم الاتصال بـ YouTube Music!',
    'toast.ytmusicNotLogged': 'لم يتم تسجيل الدخول بعد. الرجاء تسجيل الدخول بحساب Google.',
    'toast.downloadPathUpdated': 'تم تحديث مجلد التنزيل',
    'toast.dataPathUpdated': 'تم تحديث مجلد البيانات. تم تطبيق التغييرات.',
    'toast.libraryEmpty': 'المكتبة فارغة بالفعل',
    'toast.libraryCleared': 'تم مسح المكتبة',
    'toast.playlistRemoved': 'تمت الإزالة من القائمة',
    'toast.themeUpdated': 'تم تحديث السمة',
    'toast.languageUpdated': 'تم تحديث اللغة',
    'toast.sortAdded': 'الفرز: حسب الإضافة',
    'toast.sortTitle': 'الفرز: العنوان',
    'toast.sortArtist': 'الفرز: الفنان',
    'toast.sortAlbum': 'الفرز: الألبوم',
    'toast.viewDetailed': 'العرض: تفصيلي',
    'toast.viewCompact': 'العرض: مضغوط',
    'modal.newPlaylistTitle': 'قائمة تشغيل جديدة',
    'modal.newPlaylistPlaceholder': 'اسم القائمة...',
    'modal.clearLibraryTitle': 'مسح المكتبة',
    'modal.clearLibraryConfirm': 'ستتم إزالة جميع الأغاني من المكتبة. لن يتم حذف الملفات. هل تريد المتابعة؟',
  },
  it: {
    'app.name': 'Alkan Player',
    'nav.library': 'Libreria',
    'nav.playlists': 'Playlist',
    'nav.youtube': 'YouTube',
    'nav.ytmusic': 'YT Music',
    'nav.equalizer': 'Equalizzatore',
    'nav.settings': 'Impostazioni',
    'nav.addFiles': 'Aggiungi file',
    'nav.addFolder': 'Aggiungi cartella',
    'search.placeholder': 'Cerca brani, artisti o album...',
    'view.library': 'Libreria',
    'view.playlists': 'Playlist',
    'view.youtube': 'Download YouTube',
    'view.ytmusic': 'YouTube Music',
    'view.equalizer': 'Equalizzatore',
    'view.settings': 'Impostazioni',
    'playlist.new': 'Nuova playlist',
    'playlist.remove': 'Rimuovi dalla playlist',
    'playlist.emptyTitle': 'Nessuna playlist',
    'playlist.emptySub': 'Crea una nuova playlist',
    'playlist.detailEmptyTitle': 'Nessun brano in questa playlist',
    'playlist.detailEmptySub': 'Aggiungi brani dalla libreria',
    'playlist.addTo': 'Aggiungi alla playlist',
    'youtube.urlPlaceholder': 'Incolla URL di YouTube...',
    'youtube.download': 'Scarica',
    'youtube.downloading': 'Download in corso...',
    'youtube.downloadingLong': 'Download in corso... potrebbe richiedere un po\' di tempo.',
    'youtube.downloaded': 'Brani scaricati',
    'youtube.noDownloads': 'Nessun download',
    'ytmusic.loginTitle': 'Connetti a YouTube Music',
    'ytmusic.loginDesc': 'Accedi con il tuo account Google per vedere consigli personalizzati',
    'ytmusic.loginButton': 'Accedi con Google',
    'ytmusic.loginHeader': 'Accedi con il tuo account Google',
    'ytmusic.loginDone': 'Accesso completato',
    'ytmusic.searchPlaceholder': 'Cerca brani su YouTube Music...',
    'ytmusic.searchResults': 'Risultati di ricerca',
    'ytmusic.recommendationsLoading': 'Caricamento consigli...',
    'ytmusic.noRecommendations': 'Nessun consiglio. Prova ad aggiornare.',
    'ytmusic.loadingTracks': 'Caricamento brani...',
    'ytmusic.emptyPlaylist': 'Nessun brano trovato in questa playlist',
    'ytmusic.loadFailed': ({ error }) => `Impossibile caricare: ${error}`,
    'ytmusic.searching': 'Ricerca in corso...',
    'ytmusic.noResults': 'Nessun risultato',
    'ytmusic.listen': 'Ascolta',
    'ytmusic.downloadAction': 'Scarica',
    'ytmusic.browse': 'Sfoglia',
    'ytmusic.badge.playlist': 'Playlist',
    'ytmusic.badge.album': 'Album',
    'ytmusic.badge.song': 'Brano',
    'eq.flat': 'Piatto',
    'eq.rock': 'Rock',
    'eq.pop': 'Pop',
    'eq.jazz': 'Jazz',
    'eq.classical': 'Classica',
    'eq.bass': 'Bass Boost',
    'eq.vocal': 'Vocale',
    'settings.appearance': 'Aspetto',
    'settings.theme': 'Tema',
    'settings.themeDesc': 'Scegli l\'aspetto generale dell\'app',
    'settings.language': 'Lingua',
    'settings.languageDesc': 'Cambia la lingua dell\'app',
    'settings.downloads': 'Impostazioni download',
    'settings.downloadPath': 'Cartella download',
    'settings.downloadDesc': 'Cartella in cui vengono salvati i download da YouTube',
    'settings.data': 'File dati',
    'settings.dataPath': 'Cartella dati',
    'settings.dataDesc': 'Cartella in cui sono salvati i dati di libreria e playlist',
    'settings.library': 'Libreria',
    'settings.libraryCount': 'Brani in libreria',
    'settings.clearLibrary': 'Svuota libreria',
    'settings.clearLibraryDesc': 'Rimuovi tutti i brani dalla libreria (i file non verranno eliminati)',
    'settings.about': 'Informazioni',
    'settings.aboutDesc': 'Versione 1.5.2 — Lettore musicale moderno',
    'theme.dark': 'Scuro',
    'theme.light': 'Chiaro',
    'theme.ocean': 'Oceano',
    'theme.amber': 'Ambra',
    'theme.forest': 'Foresta',
    'theme.mono': 'Monocromatico',
    'lang.tr': 'Turco',
    'lang.en': 'Inglese',
    'lang.ar': 'Arabo',
    'lang.it': 'Italiano',
    'window.minimize': 'Riduci',
    'window.maximize': 'Ingrandisci',
    'window.close': 'Chiudi',
    'tooltip.sort': 'Ordina',
    'tooltip.viewToggle': 'Vista',
    'tooltip.refresh': 'Aggiorna',
    'tooltip.shuffle': 'Casuale',
    'tooltip.prev': 'Precedente',
    'tooltip.playPause': 'Play/Pausa',
    'tooltip.next': 'Successivo',
    'tooltip.repeat': 'Ripeti',
    'tooltip.volume': 'Volume',
    'context.play': '▶ Riproduci',
    'context.addToPlaylist': '📋 Aggiungi alla playlist',
    'context.remove': '🗑 Rimuovi',
    'context.reveal': '📁 Mostra nella cartella',
    'player.selectSong': 'Seleziona un brano',
    'common.change': 'Cambia',
    'common.delete': 'Elimina',
    'common.clear': 'Svuota',
    'common.cancel': 'Annulla',
    'common.create': 'Crea',
    'common.confirm': 'Conferma',
    'common.back': 'Indietro',
    'common.loading': 'Caricamento...',
    'common.unknownArtist': 'Artista sconosciuto',
    'common.unknownAlbum': 'Album sconosciuto',
    'common.default': 'Predefinito',
    'common.songCount': ({ count }) => `${count} ${count === 1 ? 'brano' : 'brani'}`,
    'empty.noMusic': 'Nessun brano aggiunto',
    'empty.noMusicSub': 'Inizia aggiungendo file o cartelle',
    'empty.noResults': 'Nessun risultato',
    'empty.noResultsSub': 'Prova una ricerca diversa',
    'toast.addedSongs': ({ count }) => `Aggiunti ${count} ${count === 1 ? 'brano' : 'brani'}`,
    'toast.shuffleOn': 'Riproduzione casuale: On',
    'toast.shuffleOff': 'Riproduzione casuale: Off',
    'toast.repeatOff': 'Ripetizione: Off',
    'toast.repeatAll': 'Ripeti tutto',
    'toast.repeatOne': 'Ripeti uno',
    'toast.playbackError': ({ message }) => `Errore di riproduzione: ${message}`,
    'toast.songRemoved': 'Brano rimosso',
    'toast.addPlaylistFirst': 'Crea prima una playlist',
    'toast.addedToPlaylist': ({ name }) => `Aggiunto a "${name}"`,
    'toast.alreadyInPlaylist': 'Il brano è già nella playlist',
    'toast.playlistDeleted': 'Playlist eliminata',
    'toast.playlistCreated': ({ name }) => `Playlist "${name}" creata`,
    'toast.downloadUrlMissing': 'Inserisci un URL di YouTube',
    'toast.downloadUrlInvalid': 'Inserisci un URL di YouTube valido',
    'toast.downloadSuccess': ({ title }) => `"${title}" scaricato!`,
    'toast.downloadError': ({ error }) => `Errore di download: ${error}`,
    'toast.downloadingTitle': ({ title }) => `Download di "${title}"...`,
    'toast.streamError': ({ error }) => `Streaming non riuscito: ${error}`,
    'toast.streamLoading': 'Caricamento brano...',
    'toast.ytmusicConnected': 'Connesso a YouTube Music!',
    'toast.ytmusicNotLogged': 'Non hai ancora effettuato l\'accesso. Accedi con il tuo account Google.',
    'toast.downloadPathUpdated': 'Cartella download aggiornata',
    'toast.dataPathUpdated': 'Cartella dati aggiornata. Modifiche applicate.',
    'toast.libraryEmpty': 'La libreria è già vuota',
    'toast.libraryCleared': 'Libreria svuotata',
    'toast.playlistRemoved': 'Rimosso dalla playlist',
    'toast.themeUpdated': 'Tema aggiornato',
    'toast.languageUpdated': 'Lingua aggiornata',
    'toast.sortAdded': 'Ordine: Aggiunti',
    'toast.sortTitle': 'Ordine: Titolo',
    'toast.sortArtist': 'Ordine: Artista',
    'toast.sortAlbum': 'Ordine: Album',
    'toast.viewDetailed': 'Vista: Dettagliata',
    'toast.viewCompact': 'Vista: Compatta',
    'modal.newPlaylistTitle': 'Nuova playlist',
    'modal.newPlaylistPlaceholder': 'Nome playlist...',
    'modal.clearLibraryTitle': 'Svuota libreria',
    'modal.clearLibraryConfirm': 'Tutti i brani verranno rimossi dalla libreria. I file non verranno eliminati. Continuare?',
  },
};

function t(key, vars = {}) {
  const lang = state.settings?.language || 'tr';
  const entry = translations[lang]?.[key] ?? translations.en?.[key] ?? translations.tr?.[key] ?? key;
  if (typeof entry === 'function') return entry(vars);
  return entry.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

function applyLanguage(lang) {
  const normalized = translations[lang] ? lang : 'tr';
  document.documentElement.lang = normalized;
  document.documentElement.dir = normalized === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  const langSelect = $('#settings-language');
  if (langSelect) langSelect.value = normalized;
}

function getFileNameFromPath(filePath) {
  if (!filePath) return '';
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

function getBaseName(filePath) {
  const name = getFileNameFromPath(filePath);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function getFileExt(filePath) {
  const name = getFileNameFromPath(filePath);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toUpperCase() : '';
}

function updatePlaylistPlayingState() {
  if (!state.activePlaylistId) return;
  const items = els.playlistTracks?.querySelectorAll('.playlist-item');
  if (!items || items.length === 0) return;
  items.forEach(item => {
    const fp = decodePath(item.dataset.path);
    const isCurrent = fp && state.currentTrack?.filePath === fp;
    item.classList.toggle('playing', isCurrent && state.isPlaying);
  });
}

function applyTheme(theme) {
  const allowed = ['dark', 'light', 'ocean', 'amber', 'forest', 'mono'];
  const normalized = allowed.includes(theme) ? theme : 'dark';
  document.body.dataset.theme = normalized;
  const themeSelect = $('#settings-theme');
  if (themeSelect) themeSelect.value = normalized;
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
    showToast(t('toast.addedSongs', { count: added }), 'success');
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

function getSortedLibrary(tracks) {
  const list = [...tracks];
  switch (state.librarySort) {
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'artist':
      return list.sort((a, b) => a.artist.localeCompare(b.artist));
    case 'album':
      return list.sort((a, b) => a.album.localeCompare(b.album));
    case 'added':
    default:
      return list;
  }
}

function renderTrackList() {
  const tracks = getSortedLibrary(getFilteredLibrary());
  if (tracks.length === 0) {
    els.trackList.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <p>${state.searchQuery ? t('empty.noResults') : t('empty.noMusic')}</p>
        <p class="sub">${state.searchQuery ? t('empty.noResultsSub') : t('empty.noMusicSub')}</p>
      </div>`;
    return;
  }
  
  els.trackList.innerHTML = tracks.map((track, i) => `
    <div class="track-item ${state.currentTrack?.filePath === track.filePath && state.isPlaying ? 'playing' : ''}" 
         data-index="${state.library.indexOf(track)}" data-path="${encodePath(track.filePath)}">
      <div class="track-item-num"><span>${i + 1}</span></div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(track.title)}</div>
        <div class="track-item-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="track-item-album">${escapeHtml(track.album)}</div>
      <div class="track-item-format">${track.format}</div>
      <div class="track-item-duration">${formatTime(track.duration)}</div>
    </div>`
  ).join('');
}

function applyLibraryView() {
  if (!els.trackList) return;
  els.trackList.classList.toggle('compact', state.libraryView === 'compact');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function decodeHtml(str) {
  const div = document.createElement('div');
  div.innerHTML = str;
  return div.textContent;
}

function encodePath(path) {
  return encodeURIComponent(path);
}

function decodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch (err) {
    return path;
  }
}

// --- Playback ---
async function playTrack(index, trackList = null) {
  const list = trackList || state.playQueue || state.library;
  if (index < 0 || index >= list.length) return;

  if (trackList) {
    state.playQueue = trackList;
  } else if (!state.playQueue) {
    state.playQueue = state.library;
  }

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
    updatePlaylistPlayingState();
    startVisualizer();
    startVuMeter();
  } catch (err) {
    console.error('Playback error:', err);
    showToast(t('toast.playbackError', { message: err.message }), 'error');
  }
}

function togglePlay() {
  if (!state.currentTrack) {
    if (state.library.length > 0) {
      playTrack(0, state.library);
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
  const queue = state.playQueue || state.library;
  if (queue.length === 0) return;
  if (state.repeat === 'one') {
    audioElement.currentTime = 0;
    audioElement.play();
    return;
  }

  let nextIndex;
  if (state.shuffle) {
    nextIndex = Math.floor(Math.random() * queue.length);
  } else {
    nextIndex = state.currentIndex + 1;
    if (nextIndex >= queue.length) {
      if (state.repeat === 'all') nextIndex = 0;
      else { state.isPlaying = false; updatePlayButton(); return; }
    }
  }
  playTrack(nextIndex, queue);
}

function playPrev() {
  const queue = state.playQueue || state.library;
  if (queue.length === 0) return;
  if (audioElement.currentTime > 3) {
    audioElement.currentTime = 0;
    return;
  }
  let prevIndex = state.currentIndex - 1;
  if (prevIndex < 0) prevIndex = queue.length - 1;
  playTrack(prevIndex, queue);
}

function updatePlayButton() {
  if (state.isPlaying) {
    els.playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    els.albumArt.classList.add('playing');
  } else {
    els.playIcon.innerHTML = '<polygon points="6,3 20,12 6,21"/>';
    els.albumArt.classList.remove('playing');
  }
  updatePlaylistPlayingState();
}

function updateNowPlaying() {
  if (!state.currentTrack) return;
  const track = state.currentTrack;
  els.trackTitle.textContent = track.title;
  els.trackArtist.textContent = track.artist;
  
  if (track.coverArt) {
    els.albumArt.innerHTML = `<img src="${track.coverArt}" alt="Cover">`;
  } else {
    els.albumArt.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
      </svg>`;
  }

  // Update document title
  document.title = `${track.title} - ${track.artist} | ${t('app.name')}`;
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
  showToast(state.shuffle ? t('toast.shuffleOn') : t('toast.shuffleOff'), 'info');
});

els.repeatBtn.addEventListener('click', () => {
  const modes = ['none', 'all', 'one'];
  const i = (modes.indexOf(state.repeat) + 1) % modes.length;
  state.repeat = modes[i];
  els.repeatBtn.classList.toggle('active', state.repeat !== 'none');
  const labels = { none: t('toast.repeatOff'), all: t('toast.repeatAll'), one: t('toast.repeatOne') };
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
  playTrack(index, state.library);
});

els.trackList.addEventListener('contextmenu', (e) => {
  const item = e.target.closest('.track-item');
  if (!item) return;
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, decodePath(item.dataset.path), parseInt(item.dataset.index));
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
      playTrack(contextTarget.index, state.library);
    } else if (action === 'remove') {
      state.library = state.library.filter(t => t.filePath !== contextTarget.filePath);
      renderTrackList();
      saveLibrary();
      showToast(t('toast.songRemoved'), 'info');
    } else if (action === 'reveal') {
      window.electronAPI.revealInExplorer(contextTarget.filePath);
    } else if (action === 'add-to-playlist') {
      showPlaylistPicker(contextTarget.filePath);
    }
  });
});

function showPlaylistPicker(filePath) {
  if (state.playlists.length === 0) {
    showToast(t('toast.addPlaylistFirst'), 'info');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const listItems = state.playlists.map((p, i) =>
    `<button class="playlist-pick-item" data-idx="${i}">${p.name} <span style="color:var(--text-muted);font-size:12px">(${t('common.songCount', { count: p.tracks.length })})</span></button>`
  ).join('');
  overlay.innerHTML = `
    <div class="modal">
      <h3>${t('playlist.addTo')}</h3>
      <div class="playlist-pick-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-bottom:12px">
        ${listItems}
      </div>
      <div class="modal-actions">
        <button class="btn-ghost btn-cancel">${t('common.cancel')}</button>
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
        showToast(t('toast.addedToPlaylist', { name: state.playlists[idx].name }), 'success');
      } else {
        showToast(t('toast.alreadyInPlaylist'), 'info');
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

// --- Library Controls ---
els.sortBtn?.addEventListener('click', () => {
  const order = ['added', 'title', 'artist', 'album'];
  const idx = (order.indexOf(state.librarySort) + 1) % order.length;
  state.librarySort = order[idx];
  renderTrackList();
  const labels = {
    added: t('toast.sortAdded'),
    title: t('toast.sortTitle'),
    artist: t('toast.sortArtist'),
    album: t('toast.sortAlbum'),
  };
  showToast(labels[state.librarySort], 'info');
});

els.viewToggleBtn?.addEventListener('click', () => {
  state.libraryView = state.libraryView === 'compact' ? 'detailed' : 'compact';
  applyLibraryView();
  showToast(state.libraryView === 'compact' ? t('toast.viewCompact') : t('toast.viewDetailed'), 'info');
});

// --- Window Controls ---
$('#btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
$('#btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
$('#btn-close').addEventListener('click', () => window.electronAPI.close());

// --- Playlists ---
async function loadPlaylists() {
  const loaded = await window.electronAPI.loadPlaylists();
  const raw = Array.isArray(loaded) ? loaded : [];
  let changed = false;
  state.playlists = raw.map(p => {
    const tracks = Array.isArray(p.tracks) ? p.tracks.map(fp => {
      const decoded = decodePath(decodeHtml(fp));
      if (decoded !== fp) changed = true;
      return decoded;
    }) : [];
    return { ...p, tracks };
  });
  if (changed) savePlaylists();
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
        <p>${t('playlist.emptyTitle')}</p>
        <p class="sub">${t('playlist.emptySub')}</p>
      </div>`;
    return;
  }

  els.playlistGrid.innerHTML = state.playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <button class="playlist-card-delete" data-delete="${p.id}" title="${t('common.delete')}">✕</button>
      <div class="playlist-card-icon">🎵</div>
      <div class="playlist-card-name">${escapeHtml(p.name)}</div>
      <div class="playlist-card-count">${t('common.songCount', { count: p.tracks.length })}</div>
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
      showToast(t('toast.playlistDeleted'), 'info');
    });
  });
}

async function openPlaylistDetail(playlistId) {
  const playlist = state.playlists.find(p => p.id === playlistId);
  if (!playlist) return;

  state.activePlaylistId = playlistId;
  els.playlistGrid.style.display = 'none';
  els.playlistDetail.classList.remove('hidden');
  els.playlistDetailName.textContent = playlist.name;
  els.playlistTrackCount.textContent = t('common.songCount', { count: playlist.tracks.length });

  const tracks = [];
  let addedToLibrary = false;
  for (const fp of playlist.tracks) {
    let track = state.library.find(t => t.filePath === fp);
    if (!track) {
      try {
        const meta = await window.electronAPI.getMetadata(fp);
        track = { filePath: fp, ...meta };
        state.library.push(track);
        addedToLibrary = true;
      } catch (err) {
        track = {
          filePath: fp,
          title: getBaseName(fp) || t('common.unknownAlbum'),
          artist: t('common.unknownArtist'),
          album: t('common.unknownAlbum'),
          duration: 0,
          coverArt: null,
          format: getFileExt(fp) || '',
        };
      }
    }
    if (track) tracks.push(track);
  }
  if (addedToLibrary) saveLibrary();
  
  if (tracks.length === 0) {
    els.playlistTracks.innerHTML = `
      <div class="empty-state">
        <p>${t('playlist.detailEmptyTitle')}</p>
        <p class="sub">${t('playlist.detailEmptySub')}</p>
      </div>`;
    return;
  }

  els.playlistTracks.innerHTML = tracks.map((track, i) => `
    <div class="track-item playlist-item ${state.currentTrack?.filePath === track.filePath && state.isPlaying ? 'playing' : ''}" 
         data-playlist-index="${i}" data-path="${encodePath(track.filePath)}">
      <div class="track-item-num"><span>${i + 1}</span></div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHtml(track.title)}</div>
        <div class="track-item-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="track-item-album">${escapeHtml(track.album)}</div>
      <div class="track-item-format">${track.format}</div>
      <div class="track-item-actions">
        <span class="track-item-duration">${formatTime(track.duration)}</span>
        <button class="track-item-remove" title="${t('playlist.remove')}">✕</button>
      </div>
    </div>`
  ).join('');

  if (!els.playlistTracks.dataset.bound) {
    els.playlistTracks.dataset.bound = 'true';
    els.playlistTracks.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.track-item-remove');
      if (removeBtn) {
        const item = e.target.closest('.track-item');
        const fp = item ? decodePath(item.dataset.path) : '';
        const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
        if (playlist && fp) {
          playlist.tracks = playlist.tracks.filter(t => t !== fp);
          savePlaylists();
          showToast(t('toast.playlistRemoved'), 'info');
          openPlaylistDetail(playlist.id);
          if (state.playQueue && state.activePlaylistId === playlist.id) {
            const updated = playlist.tracks
              .map(p => state.library.find(t => t.filePath === p))
              .filter(Boolean);
            state.playQueue = updated;
            state.currentIndex = updated.findIndex(t => t.filePath === state.currentTrack?.filePath);
          }
        }
        return;
      }

      const item = e.target.closest('.track-item');
      if (!item) return;
      const playlist = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!playlist) return;
      const list = playlist.tracks
        .map(p => state.library.find(t => t.filePath === p))
        .filter(Boolean);
      const index = parseInt(item.dataset.playlistIndex);
      playTrack(index, list);
    });
  }
}

$('#btn-playlist-back').addEventListener('click', () => {
  els.playlistDetail.classList.add('hidden');
  els.playlistGrid.style.display = '';
  state.activePlaylistId = null;
});

$('#btn-new-playlist').addEventListener('click', () => {
  showModal(t('modal.newPlaylistTitle'), t('modal.newPlaylistPlaceholder'), (name) => {
    if (!name.trim()) return;
    state.playlists.push({ id: generateId(), name: name.trim(), tracks: [] });
    savePlaylists();
    renderPlaylists();
    showToast(t('toast.playlistCreated', { name }), 'success');
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
          <button class="btn-ghost btn-cancel">${t('common.cancel')}</button>
          <button class="btn-danger" style="padding:8px 16px">${confirmLabel || t('common.confirm')}</button>
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
          <button class="btn-ghost btn-cancel">${t('common.cancel')}</button>
          <button class="btn-accent btn-confirm">${t('common.create')}</button>
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
    showToast(t('toast.downloadUrlMissing'), 'error');
    return;
  }

  if (!url.match(/youtube\.com|youtu\.be/)) {
    showToast(t('toast.downloadUrlInvalid'), 'error');
    return;
  }

  els.downloadStatus.classList.remove('hidden');
  els.downloadStatus.querySelector('span').textContent = t('youtube.downloadingLong');

  const result = await window.electronAPI.youtubeDownload(url);
  els.downloadStatus.classList.add('hidden');

  if (result.success) {
    showToast(t('toast.downloadSuccess', { title: result.title }), 'success');
    els.youtubeUrl.value = '';
    
    // Add to downloads list
    state.downloads.push(result);
    renderDownloads();
    
    // Add to library
    addFilesToLibrary([result.filePath]);
  } else {
    showToast(t('toast.downloadError', { error: result.error }), 'error');
  }
});

els.youtubeUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-youtube-download').click();
});

function renderDownloads() {
  if (state.downloads.length === 0) {
    els.downloadList.innerHTML = `<p style="color:var(--text-muted);font-size:12px">${t('youtube.noDownloads')}</p>`;
    return;
  }
  els.downloadList.innerHTML = state.downloads.map(d => `
    <div class="download-item" data-path="${encodePath(d.filePath)}">
      <div class="download-item-icon">🎵</div>
      <div class="download-item-info">
        <div class="download-item-title">${escapeHtml(d.title)}</div>
        <div class="download-item-meta">${d.artist || 'YouTube'} · ${formatTime(d.duration)}</div>
      </div>
    </div>`
  ).join('');

  $$('.download-item').forEach(item => {
    item.addEventListener('click', () => {
      const fp = decodePath(item.dataset.path);
      const idx = state.library.findIndex(t => t.filePath === fp);
      if (idx >= 0) playTrack(idx, state.library);
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
    showToast(t('toast.ytmusicConnected'), 'success');
  } else {
    showToast(t('toast.ytmusicNotLogged'), 'error');
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
    shelvesEl.innerHTML = `<div class="ytmusic-empty">${t('ytmusic.noRecommendations')}</div>`;
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
  const badgeLabel = item.type === 'playlist'
    ? t('ytmusic.badge.playlist')
    : item.type === 'album'
      ? t('ytmusic.badge.album')
      : item.type === 'song'
        ? t('ytmusic.badge.song')
        : item.type;
  const badge = item.type !== 'song'
    ? `<div class="ytmusic-card-badge ${item.type}">${badgeLabel}</div>`
    : '';
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
            <button class="ytmusic-card-btn ytmusic-card-play" data-action="stream" title="${t('ytmusic.listen')}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21"/>
              </svg>
            </button>
            <button class="ytmusic-card-btn ytmusic-card-dl" data-action="download" title="${t('ytmusic.downloadAction')}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round"/>
              </svg>
            </button>
          ` : isBrowsable ? `
            <button class="ytmusic-card-btn ytmusic-card-play" data-action="browse" title="${t('ytmusic.browse')}">
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
        showToast(t('toast.downloadingTitle', { title }), 'info');
        const result = await window.electronAPI.youtubeDownload(url);
        if (result.success) {
          showToast(t('toast.downloadSuccess', { title: result.title }), 'success');
          state.downloads.push(result);
          renderDownloads();
          await addFilesToLibrary([result.filePath]);
        } else {
          showToast(t('toast.downloadError', { error: result.error }), 'error');
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

  showToast(t('toast.streamLoading'), 'info');
  els.trackTitle.textContent = title;
  els.trackArtist.textContent = 'YouTube Music';
  if (thumbnail) {
    els.albumArt.innerHTML = `<img src="${thumbnail}" alt="Cover">`;
  }

  const result = await window.electronAPI.ytGetStreamUrl(videoId);
  if (!result.success) {
    showToast(t('toast.streamError', { error: result.error }), 'error');
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
    document.title = `${title} — YouTube Music | ${t('app.name')}`;
  } catch (err) {
    showToast(t('toast.playbackError', { message: err.message }), 'error');
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

  $('#ytmusic-pl-title').textContent = title || t('common.loading');
  $('#ytmusic-pl-subtitle').textContent = '';
  $('#ytmusic-pl-thumb').innerHTML = '';
  $('#ytmusic-pl-tracks').innerHTML = `<div class="ytmusic-loading"><div class="download-spinner"></div><span>${t('ytmusic.loadingTracks')}</span></div>`;

  const data = await window.electronAPI.ytMusicGetPlaylist(browseId);

  if (data.error) {
    $('#ytmusic-pl-tracks').innerHTML = `<div class="ytmusic-empty">${t('ytmusic.loadFailed', { error: data.error })}</div>`;
    return;
  }

  if (data.title) $('#ytmusic-pl-title').textContent = data.title;
  if (data.subtitle) $('#ytmusic-pl-subtitle').textContent = data.subtitle;
  if (data.thumbnail) $('#ytmusic-pl-thumb').innerHTML = `<img src="${data.thumbnail}" alt="">`;

  if (!data.tracks || data.tracks.length === 0) {
    $('#ytmusic-pl-tracks').innerHTML = `<div class="ytmusic-empty">${t('ytmusic.emptyPlaylist')}</div>`;
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
          <button class="yt-track-btn yt-btn-play" data-action="stream" title="${t('ytmusic.listen')}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>
          </button>
          <button class="yt-track-btn yt-btn-dl" data-action="download" title="${t('ytmusic.downloadAction')}">
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
        showToast(t('toast.downloadingTitle', { title }), 'info');
        const result = await window.electronAPI.youtubeDownload(url);
        btn.classList.remove('loading');
        if (result.success) {
          showToast(t('toast.downloadSuccess', { title: result.title }), 'success');
          state.downloads.push(result);
          renderDownloads();
          await addFilesToLibrary([result.filePath]);
        } else {
          showToast(t('toast.downloadError', { error: result.error }), 'error');
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
  grid.innerHTML = `<div class="ytmusic-loading"><div class="download-spinner"></div><span>${t('ytmusic.searching')}</span></div>`;

  const data = await window.electronAPI.ytMusicSearch(query);

  if (!data.results || data.results.length === 0) {
    grid.innerHTML = `<div class="ytmusic-empty">${t('ytmusic.noResults')}</div>`;
    return;
  }

  grid.innerHTML = data.results.map(item => renderYtCard(item)).join('');
  attachYtCardEvents(grid);
}

// Refresh
$('#btn-yt-refresh')?.addEventListener('click', () => {
  ytMusicLoaded = false;
  const shelvesEl = $('#ytmusic-shelves');
  shelvesEl.innerHTML = `<div class="ytmusic-loading" id="ytmusic-loading"><div class="download-spinner"></div><span>${t('ytmusic.recommendationsLoading')}</span></div>`;
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

function applyEqPreset(key) {
  const preset = EQ_PRESETS[key];
  if (!preset) return;
  const sliders = $$('.eq-slider');
  sliders.forEach((slider, i) => {
    slider.value = preset[i];
    if (eqFilters[i]) eqFilters[i].gain.value = preset[i];
    const valueEl = slider.parentElement?.querySelector('.eq-value');
    if (valueEl) valueEl.textContent = `${preset[i]} dB`;
  });
  if (els.eqPreset) els.eqPreset.value = key;
  if (els.eqPresetChips) {
    els.eqPresetChips.querySelectorAll('.eq-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === key);
    });
  }
}

els.eqPreset.addEventListener('change', () => {
  applyEqPreset(els.eqPreset.value);
});

els.eqPresetChips?.addEventListener('click', (e) => {
  const btn = e.target.closest('.eq-chip');
  if (!btn) return;
  applyEqPreset(btn.dataset.preset);
});

$$('.eq-slider').forEach((slider, i) => {
  slider.addEventListener('input', () => {
    if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(slider.value);
    const valueEl = slider.parentElement?.querySelector('.eq-value');
    if (valueEl) valueEl.textContent = `${slider.value} dB`;
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
  const loaded = await window.electronAPI.loadSettings();
  state.settings = loaded && typeof loaded === 'object' ? loaded : {};
  if (!state.settings.theme) state.settings.theme = 'dark';
  if (!state.settings.language) state.settings.language = 'tr';
  applyTheme(state.settings.theme);
  applyLanguage(state.settings.language);
}

async function saveSettingsToFile() {
  await window.electronAPI.saveSettings(state.settings);
}

function renderSettings() {
  const pathEl = $('#settings-download-path');
  const dataPathEl = $('#settings-data-path');
  const countEl = $('#settings-library-count');
  const themeEl = $('#settings-theme');
  const languageEl = $('#settings-language');
  if (pathEl) pathEl.textContent = state.settings.downloadPath || t('common.default');
  if (dataPathEl) {
    window.electronAPI.getDataPath().then(p => { dataPathEl.textContent = p; });
  }
  if (countEl) countEl.textContent = t('common.songCount', { count: state.library.length });
  if (themeEl) themeEl.value = state.settings.theme || 'dark';
  if (languageEl) languageEl.value = state.settings.language || 'tr';
}

$('#settings-theme')?.addEventListener('change', async (e) => {
  const theme = e.target.value;
  state.settings.theme = theme;
  applyTheme(theme);
  await saveSettingsToFile();
  showToast(t('toast.themeUpdated'), 'success');
});

$('#settings-language')?.addEventListener('change', async (e) => {
  const language = e.target.value;
  state.settings.language = language;
  applyLanguage(language);
  renderSettings();
  renderTrackList();
  renderPlaylists();
  renderDownloads();
  await saveSettingsToFile();
  showToast(t('toast.languageUpdated'), 'success');
});

$('#btn-change-download-path').addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    state.settings.downloadPath = folder;
    await saveSettingsToFile();
    renderSettings();
    showToast(t('toast.downloadPathUpdated'), 'success');
  }
});

$('#btn-change-data-path').addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    state.settings.dataPath = folder;
    await saveSettingsToFile();
    renderSettings();
    showToast(t('toast.dataPathUpdated'), 'success');
  }
});

$('#btn-clear-library').addEventListener('click', () => {
  if (state.library.length === 0) {
    showToast(t('toast.libraryEmpty'), 'info');
    return;
  }
  showModal(t('modal.clearLibraryTitle'), '', (val) => {
    state.library = [];
    saveLibrary();
    renderTrackList();
    renderSettings();
    showToast(t('toast.libraryCleared'), 'success');
  }, t('modal.clearLibraryConfirm'), t('common.clear'));
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
  applyLibraryView();
  $$('.eq-slider').forEach((slider) => {
    const valueEl = slider.parentElement?.querySelector('.eq-value');
    if (valueEl) valueEl.textContent = `${slider.value} dB`;
  });
  applyEqPreset(els.eqPreset?.value || 'flat');
}

init();
