import { loginTemplate, appTemplate } from './templates.js';
import { dashboardView, devicesView, videosView, playlistsView, geofencingView, monitorView, mapView, settingsView, connectionsView, hoursView, campaignReportsView, downloadAppView, appUpdatesView } from './views.js';
import { hasFirebaseConfig, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, addDevice, addVideoMetadata, addPlaylistWithAssignments, updatePlaylistWithAssignments, softDeletePlaylistWithAssignments, deleteVideoAndPrunePlaylists, deleteDeviceWithRelations, fetchCollection, fetchLocationTrack, deleteDocument, subscribeToDevices, subscribeToPlaylists, subscribeToConnectionRequests, updateDevice, approveConnectionWithDevice, addGeofenceRule, sendDeviceCommand, publishAppUpdate, fetchLatestAppUpdate } from './firebase.js';
import { hasAppwriteConfig, uploadVideo, uploadAppApk, deleteVideoFile, getVideoFileUrls } from './appwrite.js';
import { exportToExcel } from './export-excel.js';
import { fetchTodayHours, fetchMonthHours, fetchActiveAlerts, fetchHoursByDateRange, fetchHoursByDevice, dismissAlert, checkAndCreateAlerts, exportHoursToExcel, initHoursFirebase, subscribeToHours, DAILY_GOAL_HOURS } from './firebase-hours.js';
import { exportCampaignReportRows, fetchCampaignReports } from './firebase-reports.js';
import { notifyDiscord } from './discord.js';
import { compressVideoFile } from './video-compression.js';

const app = document.querySelector('#app');
const isDemo = !(hasFirebaseConfig && hasAppwriteConfig);
const ONLINE_THRESHOLD_MS = 6 * 60 * 1000;
const PRESENCE_REFRESH_MS = 30 * 1000;

console.log('=== SponsorGo Central ===');
console.log('Firebase:', hasFirebaseConfig ? 'OK' : 'NÃO CONFIGURADO');
console.log('Appwrite:', hasAppwriteConfig ? 'OK' : 'NÃO CONFIGURADO');
console.log('Modo:', isDemo ? 'DEMONSTRAÇÃO' : 'PRODUÇÃO');

const state = {
  user: null,
  route: 'dashboard',
  metrics: { onlineDevices: 0, offlineDevices: 0, syncedToday: 0, activeVideos: 0 },
  devices: [],
  videos: [],
  playlists: [],
  geofenceRules: [],
  connectionRequests: [],
  connectionError: '',
  appUpdate: null,
  knownConnectionRequestIds: new Set(),
  activity: [],
  hoursData: [],
  allHoursData: [],
  hoursFilters: {
    period: 'today',
    deviceId: '',
    startDate: '',
    endDate: '',
  },
  campaignMetrics: [],
  playbackProofs: [],
  campaignFilters: {
    period: 'today',
    playlistId: '',
    startDate: '',
    endDate: '',
  },
  mapFilters: {
    deviceId: 'all',
    date: getLocalDateString(),
    showRoutes: false,
  },
  mapRoutePoints: [],
  listFilters: {
    devices: { search: '', status: '' },
    videos: { search: '', status: '' },
    playlists: { search: '', status: '' },
    geofenceRules: { search: '', status: '' },
  },
  alerts: [],
  savedAlerts: [],
  loading: true,
  unsubscribe: null,
  collapsedNavSections: {},
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHoursDateRange(filters = state.hoursFilters) {
  const period = filters.period || 'today';

  switch (period) {
    case 'week': {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        startDate: getLocalDateString(weekAgo),
        endDate: getLocalDateString(),
      };
    }
    case 'month': {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'custom':
      return {
        startDate: filters.startDate || getLocalDateString(),
        endDate: filters.endDate || filters.startDate || getLocalDateString(),
      };
    case 'today':
    default:
      return {
        startDate: getLocalDateString(),
        endDate: getLocalDateString(),
      };
  }
}

function getResolvedHoursFilters() {
  const range = getHoursDateRange();
  return {
    ...state.hoursFilters,
    ...range,
  };
}

function getCampaignDateRange(filters = state.campaignFilters) {
  const period = filters.period || 'today';

  switch (period) {
    case 'week': {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        startDate: getLocalDateString(weekAgo),
        endDate: getLocalDateString(),
      };
    }
    case 'month': {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }
    case 'custom':
      return {
        startDate: filters.startDate || getLocalDateString(),
        endDate: filters.endDate || filters.startDate || getLocalDateString(),
      };
    case 'today':
    default:
      return {
        startDate: getLocalDateString(),
        endDate: getLocalDateString(),
      };
  }
}

function getResolvedCampaignFilters() {
  const range = getCampaignDateRange();
  return {
    ...state.campaignFilters,
    ...range,
  };
}

function getFilteredHoursData() {
  const { startDate, endDate, deviceId } = getResolvedHoursFilters();
  return state.allHoursData.filter((record) => {
    const date = record.date || '';
    const inDateRange = date >= startDate && date <= endDate;
    const matchesDevice = !deviceId || record.deviceId === deviceId;
    return inDateRange && matchesDevice;
  });
}

function normalizeSearch(value) {
  return String(value ?? '').trim().toLowerCase();
}

function textMatchesSearch(record, search, fields) {
  const term = normalizeSearch(search);
  if (!term) return true;
  return fields.some((field) => normalizeSearch(record?.[field]).includes(term));
}

function getFilteredDevices() {
  const filters = state.listFilters.devices;
  return state.devices.filter((device) => {
    const matchesStatus = !filters.status || device.status === filters.status;
    const matchesSearch = textMatchesSearch(device, filters.search, ['id', 'name', 'car', 'driver']);
    return matchesStatus && matchesSearch;
  });
}

function getFilteredVideos() {
  const filters = state.listFilters.videos;
  return state.videos.filter((video) => {
    const normalizedStatus = String(video.status || '').toLowerCase();
    const matchesStatus = !filters.status || normalizedStatus === filters.status;
    const matchesSearch = textMatchesSearch(video, filters.search, ['title', 'fileName', 'duration', 'size']);
    return matchesStatus && matchesSearch;
  });
}

function getFilteredPlaylists() {
  const filters = state.listFilters.playlists;
  return state.playlists.filter((playlist) => {
    const normalizedStatus = String(playlist.status || '').toLowerCase();
    const matchesStatus = !filters.status || normalizedStatus === filters.status;
    const matchesSearch = textMatchesSearch(playlist, filters.search, ['name', 'status', 'id']);
    return matchesStatus && matchesSearch;
  });
}

function getFilteredGeofenceRules() {
  const filters = state.listFilters.geofenceRules;
  return state.geofenceRules.filter((rule) => {
    const isActive = rule.active !== false;
    const matchesStatus = !filters.status ||
      (filters.status === 'active' && isActive) ||
      (filters.status === 'inactive' && !isActive);
    const playlist = state.playlists.find((item) => item.id === rule.playlistId);
    const searchable = {
      ...rule,
      playlistName: playlist?.name || '',
    };
    const matchesSearch = textMatchesSearch(searchable, filters.search, ['name', 'state', 'city', 'neighborhood', 'region', 'playlistName']);
    return matchesStatus && matchesSearch;
  });
}

function getTimestampMs(value) {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCoordinate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function getDeviceLocation(device = {}) {
  const location = device.location || device.currentLocation || device.lastLocation || device.gps || {};
  const latitude = normalizeCoordinate(
    location.latitude ?? location.lat ?? device.latitude ?? device.lat
  );
  const longitude = normalizeCoordinate(
    location.longitude ?? location.lng ?? location.lon ?? location.long ?? device.longitude ?? device.lng ?? device.lon ?? device.long
  );

  if (latitude == null || longitude == null) return null;

  return {
    latitude,
    longitude,
    accuracy: normalizeCoordinate(location.accuracy ?? device.accuracy) || 0,
    timestamp: location.timestamp ?? location.updatedAt ?? location.lastSeen ?? device.locationTimestamp ?? device.lastHeartbeat ?? device.lastSeen ?? device.updatedAt,
  };
}

function normalizeDeviceStatus(device, now = Date.now()) {
  const rawStatus = String(device?.reportedStatus ?? device?.status ?? '').trim().toLowerCase();
  const explicitOfflineStatuses = new Set(['offline', 'inactive', 'inativo', 'parado', 'stopped']);

  if (explicitOfflineStatuses.has(rawStatus)) return 'offline';

  const lastHeartbeatMs = getTimestampMs(device?.lastHeartbeat || device?.lastSeen || device?.updatedAt);
  if (!lastHeartbeatMs) return 'offline';
  return now - lastHeartbeatMs < ONLINE_THRESHOLD_MS ? 'online' : 'offline';
}

function normalizeDevicesStatus(devicesData) {
  const now = Date.now();
  return devicesData.map((device) => {
    const reportedStatus = device.reportedStatus ?? device.status ?? '';
    return {
      ...device,
      reportedStatus,
      status: normalizeDeviceStatus({ ...device, reportedStatus }, now),
    };
  });
}

function getDeviceCurrentVideoTitle(device, videos = state.videos) {
  const currentVideo = device?.currentVideo;
  const candidates = [
    device?.currentVideoId,
    typeof currentVideo === 'object' ? currentVideo?.id : currentVideo,
    typeof currentVideo === 'object' ? currentVideo?.title : '',
    typeof currentVideo === 'object' ? currentVideo?.name : '',
    device?.currentVideoName,
    device?.videoName,
    device?.videoId,
    device?.playingVideoName,
    device?.playingVideoId,
    device?.nowPlaying,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const text = String(candidate);
    const video = videos.find((item) => (
      item.id === text ||
      item.fileId === text ||
      item.title === text ||
      item.name === text
    ));
    if (video) return video.title || video.name || text;
    if (!/^[a-z0-9_-]{12,}$/i.test(text)) return text;
  }

  return '—';
}

function getAssignedDeviceIds() {
  const ids = new Set();
  state.playlists.forEach((playlist) => {
    if (playlist.deletedAt) return;
    getPlaylistDeviceIds(playlist).forEach((deviceId) => ids.add(deviceId));
  });
  return ids;
}

function buildOperationalAlerts(savedAlerts = []) {
  const now = Date.now();
  const assignedDeviceIds = getAssignedDeviceIds();
  const derivedAlerts = [];

  state.devices.forEach((device) => {
    const label = device.name || device.id || 'Tablet';
    const lastHeartbeatMs = getTimestampMs(device.lastHeartbeat || device.lastSeen);
    const minutesOffline = lastHeartbeatMs ? Math.floor((now - lastHeartbeatMs) / 60000) : null;

    if (device.status === 'offline' && (!minutesOffline || minutesOffline >= 10)) {
      derivedAlerts.push({
        id: `offline-${device.id}`,
        type: 'offline',
        severity: 'danger',
        title: 'Tablet sem contato',
        message: `${label} está offline${minutesOffline ? ` há ${minutesOffline} min` : ''}.`,
        detail: 'Verifique conexão, energia e app aberto.',
      });
    }

    if (typeof device.battery === 'number' && device.battery <= 20) {
      derivedAlerts.push({
        id: `battery-${device.id}`,
        type: 'battery',
        severity: device.battery <= 10 ? 'danger' : 'warning',
        title: 'Bateria baixa',
        message: `${label} está com ${device.battery}% de bateria.`,
        detail: 'Conecte o carregador para evitar interrupção da campanha.',
      });
    }

    if (!assignedDeviceIds.has(device.id)) {
      derivedAlerts.push({
        id: `assignment-${device.id}`,
        type: 'assignment',
        severity: 'warning',
        title: 'Sem playlist atribuída',
        message: `${label} não tem campanha vinculada.`,
        detail: 'Atribua uma playlist para garantir exibição de mídia.',
      });
    }

    if (!getDeviceLocation(device)) {
      derivedAlerts.push({
        id: `gps-${device.id}`,
        type: 'gps',
        severity: 'info',
        title: 'GPS ausente',
        message: `${label} ainda não enviou localização.`,
        detail: 'Confirme permissão de localização no tablet.',
      });
    }
  });

  const normalizedSavedAlerts = savedAlerts.map((alert) => ({
    ...alert,
    type: alert.type || 'hours',
    severity: alert.severity || 'warning',
    title: alert.title || 'Meta diária abaixo do esperado',
    message: alert.message || `${alert.driver || 'Motorista'} não rodou ${Number(alert.difference || 0).toFixed(1)} horas da meta.`,
    detail: alert.detail || `Meta: ${DAILY_GOAL_HOURS}h, rodou: ${Number(alert.drivingHours || 0).toFixed(1)}h.`,
  }));

  return [...normalizedSavedAlerts, ...derivedAlerts];
}

function formatVideoDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function detectVideoDuration(file) {
  return inspectVideoFile(file).then(({ duration }) => formatVideoDuration(duration));
}

function inspectVideoFile(file) {
  return new Promise((resolve, reject) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'mp4' || (file.type && file.type !== 'video/mp4')) {
      reject(new Error('Formato incompatível. Envie um arquivo MP4 com vídeo H.264 e áudio AAC.'));
      return;
    }

    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('O vídeo demorou demais para ser validado. Converta-o para MP4 H.264/AAC.'));
    }, 15_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'auto';
    video.muted = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      const longEdge = Math.max(width, height);
      const shortEdge = Math.min(width, height);
      if (!duration || !width || !height) {
        cleanup();
        reject(new Error('O arquivo não contém uma faixa de vídeo válida.'));
        return;
      }
      if (longEdge > 1920 || shortEdge > 1080) {
        cleanup();
        reject(new Error(`Resolução ${width}x${height} não suportada. O limite é Full HD (1920x1080).`));
        return;
      }
      video.currentTime = Math.min(0.1, duration / 2);
    };
    video.onloadeddata = () => {
      const result = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        mimeType: file.type || 'video/mp4',
      };
      cleanup();
      resolve(result);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('O navegador não conseguiu decodificar o vídeo. Converta-o para MP4 H.264/AAC.'));
    };
    video.src = objectUrl;
  });
}

function escapeCssValue(value) {
  const text = String(value ?? '');
  if (window.CSS?.escape) return window.CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function safeCssClass(value, fallback = '') {
  const text = String(value ?? fallback);
  return /^[a-z0-9_-]+$/i.test(text) ? text : fallback;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getPlaylistVideoIds(playlist) {
  return toArray(playlist?.videos)
    .map((video) => typeof video === 'string' ? video : (video?.id || video?.title || video?.name || ''))
    .filter(Boolean);
}

function getPlaylistVideoId(video) {
  return typeof video === 'string' ? video : (video?.id || video?.title || video?.name || video?.fileId || '');
}

function getPlaylistDeviceIds(playlist) {
  return toArray(playlist?.devices)
    .map((device) => typeof device === 'string' ? device : (device?.id || device?.name || ''))
    .filter(Boolean);
}

function buildPlaylistVideos(selectedVideoIds) {
  return state.videos
    .filter((video) => selectedVideoIds.includes(video.id) || selectedVideoIds.includes(video.title))
    .map((video, index) => ({
      id: video.id,
      fileId: video.fileId || '',
      name: video.title,
      order: index,
      active: true,
      checksumSha256: video.checksumSha256 || '',
      sizeBytes: Number(video.sizeBytes || 0) || null,
    }));
}

async function calculateSha256(file) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function findDevicePlaylistConflicts(selectedDeviceIds, currentPlaylistId = null) {
  const selected = new Set(selectedDeviceIds);

  return state.playlists
    .filter((playlist) => playlist.id !== currentPlaylistId && !playlist.deletedAt)
    .filter((playlist) => getPlaylistDeviceIds(playlist).some((deviceId) => selected.has(deviceId)))
    .map((playlist) => playlist.name || playlist.id);
}

const navItems = [
  { type: 'section', key: 'operation', label: 'Operação' },
  { key: 'dashboard', label: 'Visão Geral', icon: '◫' },
  { key: 'monitor', label: 'Monitoramento', icon: '◌' },
  { key: 'map', label: 'Mapa', icon: '🗺' },
  { key: 'hours', label: 'Horas', icon: '⏱' },
  { key: 'campaignReports', label: 'Campanhas', icon: '▤' },
  { type: 'section', key: 'devices', label: 'Dispositivos' },
  { key: 'connections', label: 'Conexões', icon: '🔗' },
  { key: 'devices', label: 'Tablets', icon: '▣' },
  { key: 'downloadApp', label: 'Baixar App', icon: '⬇' },
  { key: 'appUpdates', label: 'Atualizações', icon: '⇧' },
  { type: 'section', key: 'content', label: 'Conteúdo' },
  { key: 'playlists', label: 'Playlists', icon: '≣' },
  { key: 'videos', label: 'Vídeos', icon: '▶' },
  { key: 'geofencing', label: 'Geofencing', icon: '◎' },
  { type: 'section', key: 'system', label: 'Sistema' },
  { key: 'settings', label: 'Configurações', icon: '⚙' },
];

function getSectionForRoute(route) {
  let currentSection = null;
  for (const item of navItems) {
    if (item.type === 'section') {
      currentSection = item.key;
    } else if (item.key === route) {
      return currentSection;
    }
  }
  return null;
}

function showToast(title, message, type = 'info') {
  const container = document.querySelector('.toast-container') || createToastContainer();
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close">✕</button>
  `;
  
  container.appendChild(toast);
  
  toast.querySelector('.toast-close').onclick = () => toast.remove();
  
  setTimeout(() => toast.remove(), 5000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function showLoading(message = 'Carregando...') {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'global-loading';
  overlay.innerHTML = `
    <div class="loading-spinner"></div>
    <p>${escapeHtml(message)}</p>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  document.getElementById('global-loading')?.remove();
}

async function loadData() {
  if (!hasFirebaseConfig) {
    state.loading = false;
    return;
  }

  try {
    const [devicesData, videosData, playlistsData, geofenceRulesData, connectionRequestsData, hoursData, alertsData, appUpdateData] = await Promise.all([
      fetchCollection('devices'),
      fetchCollection('videos'),
      fetchCollection('playlists'),
      fetchCollection('geofenceRules'),
      fetchCollection('connectionRequests'),
      fetchTodayHours(),
      fetchActiveAlerts(),
      fetchLatestAppUpdate()
    ]);

    const devicesWithStatus = normalizeDevicesStatus(devicesData);

    state.devices = devicesWithStatus;
    state.alerts = buildOperationalAlerts(state.savedAlerts);
    state.videos = videosData.map((video) => ({
      ...video,
      ...(video.fileId && hasAppwriteConfig ? getVideoFileUrls(video.fileId) : {}),
    }));
    state.playlists = playlistsData;
    state.geofenceRules = geofenceRulesData;
    state.connectionRequests = connectionRequestsData.filter(r => r.status === 'pending');
    state.knownConnectionRequestIds = new Set(state.connectionRequests.map((request) => request.id));
    state.hoursData = hoursData;
    state.allHoursData = hoursData;
    state.savedAlerts = alertsData;
    state.alerts = buildOperationalAlerts(alertsData);
    state.appUpdate = appUpdateData;

    const onlineCount = devicesWithStatus.filter(d => d.status === 'online').length;
    const offlineCount = devicesWithStatus.filter(d => d.status === 'offline').length;

    state.metrics = {
      onlineDevices: onlineCount,
      offlineDevices: offlineCount,
      syncedToday: devicesData.filter(d => d.lastSync).length,
      activeVideos: videosData.filter(v => v.status === 'Ativo' || v.status === 'active').length,
    };
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }

  state.loading = false;
}

async function loadCampaignReports() {
  if (!hasFirebaseConfig) {
    state.campaignMetrics = [];
    state.playbackProofs = [];
    return;
  }

  const { startDate, endDate } = getResolvedCampaignFilters();

  try {
    const reportData = await fetchCampaignReports(startDate, endDate);
    state.campaignMetrics = reportData.metrics;
    state.playbackProofs = reportData.proofs;
  } catch (error) {
    console.error('Erro ao carregar relatorios de campanha:', error);
    state.campaignMetrics = [];
    state.playbackProofs = [];
    showToast('Relatórios indisponíveis', 'Não foi possível carregar as métricas de campanha.', 'warning');
  }
}

function render() {
  if (state.loading) {
    app.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;"><div class="loading-spinner"></div></div>';
    return;
  }

  if (!state.user) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = appTemplate();
  renderNav();
  renderView();
  bindAppEvents();
}

function renderNav() {
  const nav = document.querySelector('#nav');
  let currentSection = null;
  const activeSection = getSectionForRoute(state.route);

  nav.innerHTML = navItems.map((item) => {
    if (item.type === 'section') {
      currentSection = item.key;
      const isCollapsed = Boolean(state.collapsedNavSections[item.key]) && activeSection !== item.key;
      return `
        <button class="nav-section ${isCollapsed ? 'collapsed' : ''}" data-nav-section="${item.key}" type="button">
          <span>${item.label}</span>
          <span class="nav-section-arrow">▾</span>
        </button>
      `;
    }

    const isHidden = Boolean(state.collapsedNavSections[currentSection]) && activeSection !== currentSection;

    return `
      <button class="nav-button ${state.route === item.key ? 'active' : ''} ${isHidden ? 'hidden-by-section' : ''}" data-route="${item.key}">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
      </button>
    `;
  }).join('');
}

function renderView() {
  const view = document.querySelector('#view');
  if (state.route === 'map') {
    if (!state.mapFilters.date) {
      state.mapFilters.date = getLocalDateString();
    }
    if (!state.mapFilters.deviceId) {
      state.mapFilters.deviceId = 'all';
    }
  }

  const payload = {
    ...state,
    filteredDevices: getFilteredDevices(),
    filteredVideos: getFilteredVideos(),
    filteredPlaylists: getFilteredPlaylists(),
    filteredGeofenceRules: getFilteredGeofenceRules(),
    hoursData: state.route === 'hours' ? getFilteredHoursData() : state.hoursData,
    hoursFilters: getResolvedHoursFilters(),
    campaignFilters: getResolvedCampaignFilters(),
    isDemo
  };

  const views = {
    dashboard: dashboardView(payload),
    devices: devicesView(payload),
    connections: connectionsView(payload),
    hours: hoursView(payload),
    campaignReports: campaignReportsView(payload),
    videos: videosView(payload),
    playlists: playlistsView(payload),
    geofencing: geofencingView(payload),
    monitor: monitorView(payload),
    map: mapView(payload),
    settings: settingsView(payload, isDemo),
    downloadApp: downloadAppView(payload),
    appUpdates: appUpdatesView(payload),
  };

  view.innerHTML = views[state.route] || views.dashboard;
  bindForms();
  bindHoursView();
  bindCampaignReportsView();
  bindMapView();
  
  if (state.route === 'map') {
    window.mapDevicesData = buildMapDevicesData(state.devices);
    window.mapRoutePointsData = state.mapRoutePoints || [];
    console.log('renderView - route is map, scheduling initMap');
    setTimeout(initMap, 500);
  }
}

function isPlaylistFormBeingEdited() {
  const playlistForm = document.getElementById('playlist-form');
  const editPlaylistForm = document.getElementById('edit-playlist-form');
  const activeElement = document.activeElement;

  if (editPlaylistForm) return true;

  if (!playlistForm) return false;

  const activeInsideForm = activeElement && playlistForm.contains(activeElement);
  const hasName = Boolean(playlistForm.querySelector('[name="name"]')?.value?.trim());
  const hasCheckedItems = Boolean(playlistForm.querySelector('input[type="checkbox"]:checked'));

  return activeInsideForm || hasName || hasCheckedItems;
}

function shouldRenderRealtimeUpdate(routes = []) {
  if (!routes.includes(state.route)) return false;
  if (state.route === 'playlists' && isPlaylistFormBeingEdited()) return false;
  return true;
}

function buildMapDevicesData(devices) {
  return devices
    .map((device) => {
      const location = getDeviceLocation(device);
      if (!location) return null;

      const timestampMs = getTimestampMs(location.timestamp);
      return {
        id: device.id,
        name: device.name || device.id,
        car: device.car || '',
        driver: device.driver || '',
        status: device.status || 'offline',
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        lastUpdate: timestampMs ? new Date(timestampMs).toLocaleString('pt-BR') : '—'
      };
    })
    .filter(Boolean);
}

const DEFAULT_CENTER = [-22.7391, -47.3304];

function initMap() {
  const mapElement = document.getElementById('map');
  console.log('initMap - element:', !!mapElement, 'L:', !!window.L, 'map:', !!window.map, 'layer:', !!window.mapMarkersLayer);
  
  if (!mapElement) return;
  
  if (!window.L) {
    setTimeout(initMap, 200);
    return;
  }
  
  if (window.map && window.mapMarkersLayer && window.mapRouteLayer) {
    const mapContainer = window.map.getContainer?.();
    if (mapContainer === mapElement) {
      console.log('Map valid, just invalidating');
      window.map.invalidateSize?.();
      updateMapMarkers();
      return;
    } else {
      console.log('Map container changed, recreating');
      window.map = null;
      window.mapMarkersLayer = null;
      window.mapRouteLayer = null;
    }
  }
  
  try {
    console.log('Creating new map');
    const map = window.L.map('map', { preferCanvas: true });
    map.setView(DEFAULT_CENTER, 13);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    
    window.mapRouteLayer = window.L.layerGroup().addTo(map);
    window.mapMarkersLayer = window.L.layerGroup().addTo(map);
    window.map = map;
    
    console.log('Map created');
    updateMapMarkers();
  } catch (err) {
    console.error('Error:', err);
  }
}

function updateMapMarkers() {
  console.log('updateMapMarkers called', { 
    map: !!window.map, 
    layer: !!window.mapMarkersLayer,
    data: window.mapDevicesData?.length,
    routePoints: window.mapRoutePointsData?.length
  });
  
  if (!window.map || !window.mapMarkersLayer || !window.mapRouteLayer) {
    console.log('No map or layer, skipping');
    return;
  }
  
  try {
    window.mapMarkersLayer.clearLayers();
    window.mapRouteLayer.clearLayers();
  } catch(e) {
    console.log('Error clearing layers:', e);
  }
  
  const devices = window.mapDevicesData || [];
  const bounds = [];
  const selectedDeviceId = state.mapFilters.deviceId !== 'all' ? state.mapFilters.deviceId : null;
  const routePoints = (window.mapRoutePointsData || [])
    .map((point) => [normalizeCoordinate(point.latitude), normalizeCoordinate(point.longitude)])
    .filter(([lat, lng]) => lat != null && lng != null);

  if (routePoints.length > 0) {
    window.L.polyline(routePoints, {
      color: '#2f80ed',
      weight: 5,
      opacity: 0.85,
      lineJoin: 'round',
    }).addTo(window.mapRouteLayer);
    window.L.circleMarker(routePoints[0], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#27ae60',
      fillOpacity: 1,
    }).bindTooltip('Início da rota').addTo(window.mapRouteLayer);
    if (routePoints.length > 1) {
      window.L.circleMarker(routePoints[routePoints.length - 1], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#eb5757',
        fillOpacity: 1,
      }).bindTooltip('Último ponto').addTo(window.mapRouteLayer);
    }
    routePoints.forEach((point) => bounds.push(point));
  }
  
  devices.forEach((device) => {
    if (device.lat != null && device.lng != null) {
      const isOnline = device.status === 'online';
      const isSelected = selectedDeviceId === device.id;
      const icon = window.L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          background: ${isOnline ? '#4CAF50' : '#9E9E9E'};
          width: ${isSelected ? '40px' : '32px'};
          height: ${isSelected ? '40px' : '32px'};
          border-radius: 50%;
          border: ${isSelected ? '4px solid #f2c94c' : '3px solid white'};
          box-shadow: ${isSelected ? '0 0 0 5px rgba(242,201,76,.25), 0 3px 10px rgba(0,0,0,.4)' : '0 2px 6px rgba(0,0,0,0.3)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: white;
          font-weight: 700;
        ">C</div>`,
        iconSize: [isSelected ? 40 : 32, isSelected ? 40 : 32],
        iconAnchor: [isSelected ? 20 : 16, isSelected ? 20 : 16]
      });
      
      const marker = window.L.marker([device.lat, device.lng], { icon })
        .addTo(window.mapMarkersLayer)
        .bindPopup(`
          <div style="min-width: 150px;">
            <strong>${escapeHtml(device.name)}</strong><br/>
            <span>${escapeHtml(device.car || 'Sem veículo')}</span><br/>
            <span>${escapeHtml(device.driver || 'Sem motorista')}</span><br/>
            <span style="color: ${isOnline ? 'green' : 'gray'}">● ${isOnline ? 'Online' : 'Offline'}</span>
          </div>
        `);

      marker.on('click', () => window.selectMapDevice?.(device.id));
      
      if (!selectedDeviceId || isSelected) bounds.push([device.lat, device.lng]);
    }
  });
  
  if (bounds.length > 1) {
    window.map.fitBounds(bounds, { padding: [50, 50] });
  } else if (bounds.length === 1) {
    window.map.setView(bounds[0], 15);
  } else {
    window.map.setView(DEFAULT_CENTER, 13);
  }
  
  console.log('Markers updated:', bounds.length);
}

async function bindMapView() {
  if (state.route !== 'map') return;

  const deviceFilter = document.getElementById('map-device-filter');
  const dateFilter = document.getElementById('map-date-filter');

  if (!deviceFilter || !dateFilter) return;

  const updateMapFilter = async () => {
    const deviceId = deviceFilter.value;
    const date = dateFilter.value || getLocalDateString();
    state.mapFilters = { ...state.mapFilters, deviceId, date, showRoutes: deviceId !== 'all' };
    window.mapDevicesData = buildMapDevicesData(state.devices);
    state.mapRoutePoints = [];
    window.mapRoutePointsData = [];
    updateMapMarkers();

    try {
      const routePoints = deviceId === 'all' ? [] : await fetchLocationTrack(deviceId, date);
      if (state.mapFilters.deviceId !== deviceId || state.mapFilters.date !== date) return;
      state.mapRoutePoints = routePoints;
    } catch (error) {
      if (state.mapFilters.deviceId !== deviceId || state.mapFilters.date !== date) return;
      console.error('Erro ao carregar rota diária:', error);
      state.mapRoutePoints = [];
      showToast('Rota indisponível', error.message || 'Não foi possível carregar o caminho deste tablet.', 'error');
    }
    window.mapRoutePointsData = state.mapRoutePoints;
    window.mapShowRoutes = deviceId !== 'all';

    const selectedDevice = state.devices.find((device) => device.id === deviceId);
    const label = document.getElementById('map-selected-device');
    const detail = document.getElementById('map-selected-detail');
    const count = document.getElementById('map-route-count');
    if (label) label.textContent = deviceId === 'all' ? 'Todos os carros' : (selectedDevice?.name || deviceId);
    if (detail) detail.textContent = deviceId === 'all' ? `${state.devices.length} carros cadastrados` : (selectedDevice?.car || 'Veículo não informado');
    if (count) count.textContent = deviceId === 'all' ? '' : `${state.mapRoutePoints.length} pontos em ${date.split('-').reverse().join('/')}`;
    updateMapMarkers();
  };

  deviceFilter.addEventListener('change', () => updateMapFilter());
  dateFilter.addEventListener('change', () => updateMapFilter());
  window.selectMapDevice = async (deviceId) => {
    deviceFilter.value = state.mapFilters.deviceId === deviceId ? 'all' : deviceId;
    await updateMapFilter();
  };
  await updateMapFilter();
}

function bindLogin() {
  const form = document.querySelector('#login-form');
  const notice = document.querySelector('#login-notice');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '').trim();

    if (isDemo) {
      state.user = { email: email || 'demo@sponsorgo.app' };
      render();
      showToast('Bem-vindo!', 'Login realizado com sucesso.', 'success');
      return;
    }

    try {
      showLoading('Entrando...');
      await signInWithEmailAndPassword(auth, email, password);
      hideLoading();
    } catch (error) {
      hideLoading();
      if (notice) {
        notice.style.display = 'block';
        notice.className = 'notice error';
        notice.textContent = error.message || 'Não foi possível fazer login.';
      } else {
        showToast('Erro no login', error.message || 'Não foi possível fazer login.', 'error');
      }
    }
  });
}

function bindAppEvents() {
  document.querySelector('#nav')?.addEventListener('click', async (event) => {
    const sectionButton = event.target.closest('[data-nav-section]');
    if (sectionButton) {
      const sectionKey = sectionButton.dataset.navSection;
      state.collapsedNavSections[sectionKey] = !state.collapsedNavSections[sectionKey];
      renderNav();
      return;
    }

    const button = event.target.closest('[data-route]');
    if (!button) return;
    state.route = button.dataset.route;
    if (state.route === 'campaignReports') {
      await loadCampaignReports();
    }
    render();
  });

  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!isDemo) {
        await signOut(auth);
      } else {
        state.user = null;
        render();
      }
      showToast('Sessão encerrada', 'Você saiu do sistema.', 'info');
    });
  });
}

function bindForms() {
  bindDeviceForm();
  bindVideoForm();
  bindPlaylistForm();
  bindGeofenceForm();
  bindDeleteButtons();
  bindEditButtons();
  bindFileInput();
  bindExportButton();
  bindConnectButtons();
  bindDeviceCommands();
  bindListFilters();
  bindAppUpdateForm();
}

function bindDeviceCommands() {
  document.querySelectorAll('[data-device-command]').forEach((button) => {
    button.addEventListener('click', async () => {
      const device = state.devices.find((item) => item.id === button.dataset.deviceId);
      if (!device) return;
      const originalText = button.textContent;
      try {
        button.disabled = true;
        button.textContent = 'Enviando...';
        await sendDeviceCommand(device, button.dataset.deviceCommand);
        showToast('Comando enviado', `${device.name || device.id} receberá o comando assim que estiver online.`, 'success');
      } catch (error) {
        showToast('Não foi possível enviar', error.message, 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

function bindListFilters() {
  document.querySelectorAll('[data-filter-scope]').forEach((input) => {
    const updateFilter = () => {
      const scope = input.dataset.filterScope;
      const key = input.dataset.filterKey;
      if (!state.listFilters[scope] || !key) return;
      state.listFilters[scope][key] = input.value;
      const id = input.id;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      render();
      requestAnimationFrame(() => {
        const nextInput = document.getElementById(id);
        if (!nextInput) return;
        nextInput.focus();
        if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
          nextInput.setSelectionRange(selectionStart, selectionEnd);
        }
      });
    };

    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', updateFilter);
  });
}

function bindFileInput() {
  const fileInput = document.getElementById('video-file');
  if (fileInput) fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const container = fileInput.closest('.file-upload');
    const textEl = container.querySelector('.file-text');
    
    if (file) {
      container.classList.add('has-file');
      textEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
      try {
        const duration = await detectVideoDuration(file);
        if (fileInput.files[0] === file) {
          textEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB, ${duration})`;
        }
      } catch (error) {
        showToast('Duração não detectada', error.message, 'warning');
      }
    } else {
      container.classList.remove('has-file');
      textEl.textContent = 'Clique para selecionar um vídeo';
    }
  });

  const apkInput = document.getElementById('app-update-apk');
  if (apkInput) apkInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    const container = apkInput.closest('.file-upload');
    const textEl = container.querySelector('.file-text');

    if (file) {
      container.classList.add('has-file');
      textEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    } else {
      container.classList.remove('has-file');
      textEl.textContent = 'Clique para selecionar o APK';
    }
  });
}

function normalizeGeoText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function bindGeofenceForm() {
  const form = document.querySelector('#geofence-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const stateValue = String(formData.get('state') || '').trim().toUpperCase();
    const city = String(formData.get('city') || '').trim();
    const neighborhood = String(formData.get('neighborhood') || '').trim();
    const region = String(formData.get('region') || '').trim();

    if (!stateValue && !city && !neighborhood && !region) {
      showToast('Localização obrigatória', 'Informe pelo menos estado, cidade, bairro ou região.', 'warning');
      return;
    }

    const payload = {
      name: String(formData.get('name') || '').trim(),
      playlistId: String(formData.get('playlistId') || '').trim(),
      state: stateValue,
      city,
      neighborhood,
      region,
      stateKey: normalizeGeoText(stateValue),
      cityKey: normalizeGeoText(city),
      neighborhoodKey: normalizeGeoText(neighborhood),
      regionKey: normalizeGeoText(region),
      priority: Number(formData.get('priority') || 0),
      active: String(formData.get('active')) !== 'false',
    };

    try {
      showLoading('Salvando regra...');
      if (hasFirebaseConfig) {
        await addGeofenceRule(payload);
      }
      hideLoading();
      await loadData();
      form.reset();
      render();
      showToast('Regra salva', 'O geofencing será aplicado pelos tablets na próxima atualização de localização.', 'success');
    } catch (error) {
      hideLoading();
      console.error('Erro ao salvar geofence:', error);
      showToast('Erro', error.message || 'Não foi possível salvar a regra.', 'error');
    }
  });
}

function bindDeleteButtons() {
  document.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.delete;
      const id = button.dataset.id;
      const fileId = button.dataset.fileId;
      showDeleteModal(type, id, fileId);
    });
  });
}

function bindEditButtons() {
  document.querySelectorAll('[data-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const type = button.dataset.edit;
      const id = button.dataset.id;
      showEditModal(type, id);
    });
  });
}

function showDeleteModal(type, id, fileId) {
  const labels = {
    'tablet': 'tablet',
    'vídeo': 'vídeo',
    'playlist': 'playlist',
    'geofence': 'regra'
  };
  
  const icons = {
    'tablet': '▣',
    'vídeo': '▶',
    'playlist': '≣',
    'geofence': '◎'
  };
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <span class="modal-icon warning">${icons[type]}</span>
      <h3>Confirmar Exclusão</h3>
      <p>Tem certeza que deseja excluir este ${labels[type]}? Esta ação não pode ser desfeita.</p>
      <div class="modal-actions">
        <button class="button secondary" id="modal-cancel">Cancelar</button>
        <button class="button danger" id="modal-confirm">Excluir</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-cancel').onclick = () => modal.remove();
  document.getElementById('modal-confirm').onclick = async () => {
    modal.remove();
    showLoading('Excluindo...');
    await performDelete(type, id, fileId);
    hideLoading();
  };
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

async function performDelete(type, id, fileId) {
  try {
    const deletedDevice = type === 'tablet'
      ? state.devices.find((device) => device.id === id)
      : null;
    const deletedPlaylist = type === 'playlist'
      ? state.playlists.find((playlist) => playlist.id === id)
      : null;
    const deletedVideo = type !== 'tablet' && type !== 'playlist'
      ? state.videos.find((video) => video.id === id)
      : null;
    if (type === 'playlist') {
      if (hasFirebaseConfig) {
        await softDeletePlaylistWithAssignments(id, getPlaylistDeviceIds(deletedPlaylist));
      }
      notifyDiscord({
        title: 'Playlist removida',
        description: 'Uma playlist foi removida da operação.',
        color: 0xeb5757,
        fields: [
          { name: 'Playlist', value: deletedPlaylist?.name || id },
          { name: 'Tablets afetados', value: getPlaylistDeviceIds(deletedPlaylist).length },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });
      await loadData();
      render();
      showToast('Excluído', 'Playlist removida com segurança.', 'success');
      return;
    }

    if (type === 'geofence') {
      if (hasFirebaseConfig) {
        await deleteDocument('geofenceRules', id);
      }
      await loadData();
      render();
      showToast('Excluído', 'Regra de geofencing removida.', 'success');
      return;
    }

    if (type !== 'tablet' && type !== 'playlist') {
      let affectedPlaylists = [];
      if (hasFirebaseConfig) {
        const deletedVideoKeys = new Set([
          id,
          deletedVideo?.title,
          deletedVideo?.name,
          deletedVideo?.fileId,
        ].filter(Boolean));
        affectedPlaylists = state.playlists
          .map((playlist) => ({
            id: playlist.id,
            videos: toArray(playlist.videos).filter((video) => !deletedVideoKeys.has(getPlaylistVideoId(video))),
          }))
          .filter((playlist) => playlist.videos.length !== toArray(state.playlists.find((item) => item.id === playlist.id)?.videos).length);

        await deleteVideoAndPrunePlaylists(id, affectedPlaylists);
        notifyDiscord({
          title: 'Vídeo removido',
          description: 'Um vídeo foi removido da biblioteca.',
          color: 0xeb5757,
          fields: [
            { name: 'Vídeo', value: deletedVideo?.title || deletedVideo?.name || id },
            { name: 'Playlists ajustadas', value: affectedPlaylists.length },
            { name: 'Usuário', value: state.user?.email || 'admin' },
          ],
        });
      }
      if (fileId && hasAppwriteConfig) {
        try {
          await deleteVideoFile(fileId);
        } catch (storageError) {
          console.warn('Arquivo de vídeo ficou órfão no Appwrite:', storageError);
          showToast('Vídeo removido', 'O item saiu da biblioteca, mas o arquivo no Appwrite não pôde ser apagado agora.', 'warning');
        }
      }
      await loadData();
      render();
      showToast('Excluído', 'Vídeo removido da biblioteca.', 'success');
      return;
    }
    if (type === 'vídeo' && fileId && hasAppwriteConfig) {
      await deleteVideoFile(fileId);
    }

    if (hasFirebaseConfig) {
      if (type === 'tablet') {
        const affectedPlaylists = state.playlists
          .filter((playlist) => getPlaylistDeviceIds(playlist).includes(id))
          .map((playlist) => ({
            id: playlist.id,
            devices: getPlaylistDeviceIds(playlist).filter((deviceId) => deviceId !== id),
          }));
        await deleteDeviceWithRelations(id, deletedDevice?.ownerUid || '', affectedPlaylists);
      } else {
      const collectionMap = {
        'tablet': 'devices',
        'vídeo': 'videos',
        'playlist': 'playlists',
      };
      await deleteDocument(collectionMap[type], id);
      }

    }

    notifyDiscord({
      title: 'Item removido',
      description: 'Um item foi removido do SponsorGo Central.',
      color: 0xeb5757,
      fields: [
        { name: 'Tipo', value: type },
        { name: 'Item', value: deletedDevice?.name || id },
        { name: 'Usuário', value: state.user?.email || 'admin' },
      ],
    });

    await loadData();
    render();
    showToast('Excluído', 'Item removido com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao excluir:', error);
    showToast('Erro', 'Não foi possível excluir o item.', 'error');
  }
}

function showEditModal(type, id) {
  if (type === 'tablet') {
    showEditDeviceModal(id);
  } else if (type === 'playlist') {
    showEditPlaylistModal(id);
  }
}

function showEditDeviceModal(deviceId) {
  const device = state.devices.find(d => d.id === deviceId);
  if (!device) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <span class="modal-icon info">▣</span>
      <h3>Editar Tablet</h3>
      <form id="edit-device-form">
        <div class="form-group">
          <label>Nome</label>
          <input class="input" name="name" value="${escapeHtml(device.name || '')}" required />
        </div>
        <div class="form-group">
          <label>Veículo</label>
          <input class="input" name="car" value="${escapeHtml(device.car || '')}" />
        </div>
        <div class="form-group">
          <label>Motorista</label>
          <input class="input" name="driver" value="${escapeHtml(device.driver || '')}" />
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" id="modal-cancel">Cancelar</button>
          <button class="button primary" type="submit">Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  document.getElementById('edit-device-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: String(formData.get('name')).trim(),
      car: String(formData.get('car')).trim(),
      driver: String(formData.get('driver')).trim(),
    };

    try {
      if (hasFirebaseConfig) {
        await updateDevice(deviceId, payload);
      }
      modal.remove();
      await loadData();
      render();
      showToast('Salvo', 'Tablet atualizado com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao editar dispositivo:', error);
      showToast('Erro', 'Não foi possível salvar as alterações.', 'error');
    }
  });
}

function showEditPlaylistModal(playlistId) {
  const playlist = state.playlists.find(p => p.id === playlistId);
  if (!playlist) return;

  const currentVideoIds = new Set(getPlaylistVideoIds(playlist));
  const currentDeviceIds = getPlaylistDeviceIds(playlist);

  const videoCheckboxItems = state.videos.map(video => {
    const isChecked = currentVideoIds.has(video.id) || currentVideoIds.has(video.title) ? 'checked' : '';
    return `
      <label class="checkbox-item">
        <input type="checkbox" name="videos" value="${escapeHtml(video.id)}" ${isChecked} />
        <span class="checkbox-box">✓</span>
        <span class="checkbox-label">${escapeHtml(video.title)}</span>
      </label>
    `;
  }).join('');

  const deviceCheckboxItems = state.devices.map(device => {
    const isChecked = currentDeviceIds.includes(device.id) ? 'checked' : '';
    return `
        <label class="checkbox-item ${device.ownerUid ? '' : 'is-disabled'}">
          <input type="checkbox" name="devices" value="${escapeHtml(device.id)}" ${isChecked} ${device.ownerUid ? '' : 'disabled'} />
          <span class="checkbox-box">✓</span>
          <span class="checkbox-label">${escapeHtml(device.name)}${device.ownerUid ? '' : ' · reconexão necessária'}</span>
      </label>
    `;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal large">
      <span class="modal-icon info">≣</span>
      <h3>Editar Playlist</h3>
      <form id="edit-playlist-form">
        <div class="form-group">
          <label>Nome</label>
          <input class="input" name="name" value="${escapeHtml(playlist.name || '')}" required />
        </div>
        <div class="form-group">
          <label>Vídeos</label>
          <div class="checkbox-list">
            ${videoCheckboxItems || '<p class="text-muted">Nenhum vídeo disponível</p>'}
          </div>
        </div>
        <div class="form-group">
          <label>Tablets</label>
          <div class="checkbox-list">
            ${deviceCheckboxItems || '<p class="text-muted">Nenhum tablet disponível</p>'}
          </div>
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" id="modal-cancel">Cancelar</button>
          <button class="button primary" type="submit">Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  document.getElementById('edit-playlist-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedVideoIds = Array.from(e.target.querySelectorAll('input[name="videos"]:checked')).map(cb => cb.value);
    const selectedDeviceIds = Array.from(e.target.querySelectorAll('input[name="devices"]:checked')).map(cb => cb.value);

    console.log('IDs de vídeos selecionados:', selectedVideoIds);
    console.log('Vídeos disponíveis no state:', state.videos.map(v => ({ id: v.id, title: v.title })));
    console.log('Videos found:', buildPlaylistVideos(selectedVideoIds));

    const conflicts = findDevicePlaylistConflicts(selectedDeviceIds, playlistId);
    if (conflicts.length > 0) {
      showToast('Tablet já em uso', `Remova o tablet da playlist ${conflicts.join(', ')} antes de salvar.`, 'warning');
      return;
    }

    const videosWithMeta = buildPlaylistVideos(selectedVideoIds);

    const payload = {
      name: String(e.target.querySelector('[name="name"]').value).trim(),
      videos: videosWithMeta,
      devices: selectedDeviceIds,
      status: playlist.status || 'Ativa',
    };

try {
      if (hasFirebaseConfig) {
        console.log('Atualizando playlist:', playlistId, payload);
        await updatePlaylistWithAssignments(playlistId, payload, currentDeviceIds, selectedDeviceIds);
      }
      notifyDiscord({
        title: 'Playlist atualizada',
        description: 'Uma playlist teve conteúdo ou tablets alterados.',
        color: 0x2f80ed,
        fields: [
          { name: 'Playlist', value: payload.name },
          { name: 'Videos', value: videosWithMeta.length },
          { name: 'Tablets', value: selectedDeviceIds.length },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });
      modal.remove();
      await loadData();
      render();
      showToast('Salvo', 'Playlist atualizada com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao editar playlist:', error);
      showToast('Erro', `Não foi possível salvar a playlist: ${error.message}`, 'error');
    }
  });
}

function bindDeviceForm() {
  const form = document.querySelector('#device-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      id: String(formData.get('deviceCode')).trim(),
      name: String(formData.get('name')).trim(),
      car: String(formData.get('car')).trim(),
      driver: String(formData.get('driver')).trim(),
      status: 'offline',
      battery: null,
      currentVideo: null,
      lastSeen: null,
      sync: null,
      createdAt: new Date(),
    };

    try {
      if (hasFirebaseConfig) await addDevice(payload);
      notifyDiscord({
        title: 'Tablet cadastrado',
        description: 'Um tablet foi cadastrado manualmente.',
        color: 0x27ae60,
        fields: [
          { name: 'Tablet', value: payload.name },
          { name: 'Código', value: payload.id },
          { name: 'Veiculo', value: payload.car || '-' },
          { name: 'Motorista', value: payload.driver || '-' },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });
      await loadData();
      showToast('Tablet Cadastrado', `${payload.name} foi adicionado.`, 'success');
      form.reset();
      render();
    } catch (error) {
      showToast('Erro', error.message || 'Não foi possível cadastrar o tablet.', 'error');
    }
  });
}

function bindConnectButtons() {
  document.querySelectorAll('[data-connect]').forEach(button => {
    button.addEventListener('click', () => {
      const deviceId = button.dataset.connect;
      if (deviceId && !button.disabled) {
        showConnectDeviceModal(deviceId);
      }
    });
  });
}

function showConnectDeviceModal(deviceId) {
  const existingDevice = state.devices.find(d => d.id === deviceId);
  const connectionRequest = state.connectionRequests.find(request => request.deviceId === deviceId || request.id === deviceId);
  const modelLabel = connectionRequest?.model || connectionRequest?.deviceName || existingDevice?.model || existingDevice?.deviceName || '';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <span class="modal-icon info">🔗</span>
      <h3>Conectar Tablet</h3>
      <p>Configure o dispositivo: <strong>${escapeHtml(deviceId)}</strong></p>
      ${modelLabel ? `<p class="text-muted">Modelo detectado: ${escapeHtml(modelLabel)}</p>` : ''}
      <form id="connect-device-form">
        <div class="form-group">
          <label>Nome do Tablet</label>
          <input class="input" name="name" value="${escapeHtml(existingDevice?.name || '')}" placeholder="Tablet Corolla 01" required />
        </div>
        <div class="form-group">
          <label>Veículo</label>
          <input class="input" name="car" value="${escapeHtml(existingDevice?.car || '')}" placeholder="Toyota Corolla" />
        </div>
        <div class="form-group">
          <label>Motorista</label>
          <input class="input" name="driver" value="${escapeHtml(existingDevice?.driver || '')}" placeholder="João Silva" />
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" id="modal-cancel">Cancelar</button>
          <button class="button primary" type="submit">Conectar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  document.getElementById('connect-device-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: String(formData.get('name')).trim(),
      car: String(formData.get('car')).trim(),
      driver: String(formData.get('driver')).trim(),
      status: 'offline',
      battery: null,
      currentVideo: null,
      lastSeen: null,
      deviceName: modelLabel || deviceId,
      model: modelLabel || null,
      createdAt: new Date(),
    };

    try {
      showLoading('Conectando...');

      if (hasFirebaseConfig) {
        await approveConnectionWithDevice(deviceId, payload, { approvedBy: state.user?.email || 'admin' });
      }

      notifyDiscord({
        title: 'Tablet conectado',
        description: 'Uma solicitação de conexão foi aprovada.',
        color: 0x27ae60,
        fields: [
          { name: 'Tablet', value: payload.name },
          { name: 'Código', value: deviceId },
          { name: 'Veiculo', value: payload.car || '-' },
          { name: 'Motorista', value: payload.driver || '-' },
          { name: 'Aprovado por', value: state.user?.email || 'admin' },
        ],
      });
      modal.remove();
      hideLoading();
      await loadData();
      render();
      showToast('Tablet Conectado', `${payload.name} foi conectado com sucesso.`, 'success');
    } catch (error) {
      hideLoading();
      console.error('Erro ao conectar dispositivo:', error);
      showToast('Erro', 'Não foi possível conectar o tablet.', 'error');
    }
});
}

function bindVideoForm() {
  const form = document.querySelector('#video-form');
  if (!form) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const progressEl = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');
  const progressPercent = document.getElementById('upload-progress-percent');
  const progressSteps = Array.from(document.querySelectorAll('#upload-progress-steps [data-stage]'));
  const progressStageOrder = ['prepare', 'compress', 'upload', 'save'];

  const setUploadProgress = (progress, label = 'Preparando envio...', stage = 'prepare') => {
    const value = Math.max(0, Math.min(100, Math.round(progress || 0)));
    const activeIndex = progressStageOrder.indexOf(stage);
    if (progressEl) progressEl.hidden = false;
    if (progressBar) progressBar.style.width = `${value}%`;
    if (progressText) progressText.textContent = label;
    if (progressPercent) progressPercent.textContent = `${value}%`;

    progressSteps.forEach((step) => {
      const stepIndex = progressStageOrder.indexOf(step.dataset.stage);
      step.classList.toggle('is-active', step.dataset.stage === stage);
      step.classList.toggle('is-complete', activeIndex > stepIndex);
    });
  };

  const resetUploadProgress = () => {
    if (progressEl) progressEl.hidden = true;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Aguardando arquivo...';
    if (progressPercent) progressPercent.textContent = '0%';
    progressSteps.forEach((step) => {
      step.classList.remove('is-active', 'is-complete');
    });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const file = formData.get('file');
    if (!(file instanceof File) || !file.name || file.size <= 0) {
      showToast('Arquivo obrigatório', 'Selecione um vídeo antes de enviar.', 'warning');
      return;
    }

    let uploadedFileId = '';
    try {
      submitButton.disabled = true;
      setUploadProgress(3, 'Lendo vídeo...', 'prepare');
      const inspection = await inspectVideoFile(file);
      const duration = formatVideoDuration(inspection.duration);
      setUploadProgress(8, 'Validando vídeo...', 'prepare');

      let uploadFile = file;
      let uploadInspection = inspection;
      let compressionMeta = {
        compressed: false,
        originalSizeBytes: file.size,
        compressedSizeBytes: file.size,
      };

      const compressionResult = await compressVideoFile(file, ({ stage, progress }) => {
        const label = stage === 'loading' ? 'Carregando compressor...' : 'Comprimindo vídeo...';
        const value = 8 + ((progress || 0) * 0.27);
        setUploadProgress(value, label, 'compress');
      });

      uploadFile = compressionResult.file;
      compressionMeta = {
        compressed: compressionResult.compressed,
        originalSizeBytes: compressionResult.originalSize,
        compressedSizeBytes: compressionResult.compressedSize,
      };

      if (compressionResult.compressed) {
        setUploadProgress(36, 'Validando vídeo comprimido...', 'compress');
        uploadInspection = await inspectVideoFile(uploadFile);
      } else {
        setUploadProgress(36, 'Usando arquivo original...', 'compress');
      }

      const payload = {
        title: String(formData.get('title')).trim(),
        duration,
        status: 'Ativo',
        checksumSha256: await calculateSha256(uploadFile),
        sizeBytes: uploadFile.size,
        width: uploadInspection.width,
        height: uploadInspection.height,
        container: 'mp4',
        playbackProfile: 'H.264/AAC Full HD',
        compatibilityCheckedAt: Date.now(),
        compression: compressionMeta,
      };

      let uploadedMeta = {
        fileName: uploadFile.name,
        size: `${Math.round(uploadFile.size / (1024 * 1024))} MB`,
      };

      if (hasAppwriteConfig && uploadFile) {
        const upload = await uploadVideo(uploadFile, (progress) => {
          const uploadProgress = 38 + ((progress.progress || 0) * 0.57);
          setUploadProgress(uploadProgress, 'Enviando vídeo...', 'upload');
        });
        uploadedFileId = upload.fileId;
        uploadedMeta = {
          fileName: upload.fileName,
          size: `${Math.round(upload.sizeOriginal / (1024 * 1024))} MB`,
          fileId: upload.fileId,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeOriginal,
          viewUrl: upload.viewUrl,
          downloadUrl: upload.downloadUrl,
        };
      }

      setUploadProgress(96, 'Salvando dados...', 'save');
      if (hasFirebaseConfig) {
        await addVideoMetadata({ ...payload, ...uploadedMeta });
      }

      notifyDiscord({
        title: 'Vídeo enviado',
        description: 'Um novo vídeo foi adicionado à biblioteca.',
        color: 0x2f80ed,
        fields: [
          { name: 'Título', value: payload.title },
          { name: 'Duração', value: payload.duration },
          { name: 'Arquivo', value: uploadedMeta.fileName },
          { name: 'Tamanho', value: uploadedMeta.size },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });
      setUploadProgress(100, 'Concluído', 'save');
      await loadData();
      showToast('Vídeo enviado', `${payload.title} foi adicionado à biblioteca.`, 'success');
      form.reset();
      resetUploadProgress();
      render();
    } catch (error) {
      if (uploadedFileId && hasAppwriteConfig) {
        try {
          await deleteVideoFile(uploadedFileId);
        } catch (cleanupError) {
          console.warn('Não foi possível remover o arquivo enviado após falha:', cleanupError);
        }
      }
      showToast('Erro', error.message || 'Não foi possível enviar o vídeo.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindAppUpdateForm() {
  const form = document.querySelector('#app-update-form');
  if (!form) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const progressEl = document.getElementById('app-update-progress');
  const progressBar = document.getElementById('app-update-progress-bar');
  const progressText = document.getElementById('app-update-progress-text');
  const progressPercent = document.getElementById('app-update-progress-percent');

  const setProgress = (progress, label) => {
    const value = Math.max(0, Math.min(100, Math.round(progress || 0)));
    if (progressEl) progressEl.hidden = false;
    if (progressBar) progressBar.style.width = `${value}%`;
    if (progressText) progressText.textContent = label;
    if (progressPercent) progressPercent.textContent = `${value}%`;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!hasAppwriteConfig) {
      showToast('Appwrite não configurado', 'Configure o Appwrite antes de publicar atualizações.', 'error');
      return;
    }

    if (!hasFirebaseConfig) {
      showToast('Firebase não configurado', 'Configure o Firebase antes de publicar atualizações.', 'error');
      return;
    }

    const formData = new FormData(form);
    const file = formData.get('apk');
    if (!(file instanceof File) || !file.name || file.size <= 0) {
      showToast('APK obrigatório', 'Selecione um APK antes de publicar.', 'warning');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.apk')) {
      showToast('Arquivo inválido', 'Envie um arquivo .apk.', 'warning');
      return;
    }

    const versionCode = Number(formData.get('versionCode'));
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      showToast('Version code inválido', 'Informe um versionCode inteiro e maior que zero.', 'warning');
      return;
    }

    let uploadedFileId = '';
    try {
      submitButton.disabled = true;
      setProgress(5, 'Calculando checksum...');
      const checksumSha256 = await calculateSha256(file);

      setProgress(15, 'Enviando APK...');
      const upload = await uploadAppApk(file, (progress) => {
        setProgress(15 + ((progress.progress || 0) * 0.75), 'Enviando APK...');
      });
      uploadedFileId = upload.fileId;

      const payload = {
        active: formData.get('active') === 'on',
        required: formData.get('required') === 'on',
        packageName: String(formData.get('packageName') || '').trim(),
        versionCode,
        versionName: String(formData.get('versionName') || '').trim(),
        title: 'Atualização disponível',
        message: String(formData.get('message') || '').trim(),
        fileId: upload.fileId,
        apkUrl: upload.downloadUrl || '',
        fileName: upload.fileName || file.name,
        mimeType: upload.mimeType || 'application/vnd.android.package-archive',
        sizeBytes: upload.sizeOriginal || file.size,
        checksumSha256,
        publishedBy: state.user?.email || 'admin',
      };

      if (!payload.packageName) throw new Error('Informe o package do app.');
      if (!payload.versionName) throw new Error('Informe o version name.');
      if (!payload.message) throw new Error('Informe a mensagem.');

      setProgress(94, 'Publicando no Firebase...');
      await publishAppUpdate(payload);

      notifyDiscord({
        title: 'Atualização do app publicada',
        description: 'Uma nova versão do SponsorGo Player foi disponibilizada.',
        color: 0x27ae60,
        fields: [
          { name: 'Package', value: payload.packageName },
          { name: 'Versão', value: `${payload.versionName} (${payload.versionCode})` },
          { name: 'Obrigatória', value: payload.required ? 'Sim' : 'Não' },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });

      setProgress(100, 'Atualização publicada');
      await loadData();
      showToast('Atualização publicada', `Versão ${payload.versionName} disponível para os tablets.`, 'success');
      render();
    } catch (error) {
      if (uploadedFileId) {
        try {
          await deleteVideoFile(uploadedFileId);
        } catch (cleanupError) {
          console.warn('Não foi possível remover o APK enviado após falha:', cleanupError);
        }
      }
      showToast('Erro', error.message || 'Não foi possível publicar a atualização.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindPlaylistForm() {
  const form = document.querySelector('#playlist-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    
    const selectedVideoIds = Array.from(form.querySelectorAll('input[name="videos"]:checked')).map(cb => cb.value);
    const selectedDeviceIds = Array.from(form.querySelectorAll('input[name="devices"]:checked')).map(cb => cb.value);

    const conflicts = findDevicePlaylistConflicts(selectedDeviceIds);
    if (conflicts.length > 0) {
      showToast('Tablet já em uso', `Remova o tablet da playlist ${conflicts.join(', ')} antes de criar outra.`, 'warning');
      return;
    }

    const videosWithMeta = buildPlaylistVideos(selectedVideoIds);

    const payload = {
      name: String(formData.get('name')).trim(),
      videos: videosWithMeta,
      devices: selectedDeviceIds,
      status: 'Ativa',
    };

    try {
      showLoading('Salvando playlist...');
      
      if (hasFirebaseConfig) {
        await addPlaylistWithAssignments(payload, selectedDeviceIds);
      }
      
      notifyDiscord({
        title: 'Playlist criada',
        description: 'Uma nova playlist foi criada e atribuída.',
        color: 0x27ae60,
        fields: [
          { name: 'Playlist', value: payload.name },
          { name: 'Videos', value: videosWithMeta.length },
          { name: 'Tablets', value: selectedDeviceIds.length },
          { name: 'Usuário', value: state.user?.email || 'admin' },
        ],
      });
      hideLoading();
      await loadData();
      showToast('Playlist Salva', `${payload.name} foi criada com sucesso.`, 'success');
      form.reset();
      render();
    } catch (error) {
      hideLoading();
      showToast('Erro', error.message || 'Não foi possível salvar a playlist.', 'error');
    }
  });
}

function setupRealtimeListeners() {
  if (state.unsubscribe) {
    state.unsubscribe();
  }

  const unsubDevices = subscribeToDevices((devicesData) => {
    const devicesWithStatus = normalizeDevicesStatus(devicesData);

    state.devices = devicesWithStatus;

    const onlineCount = devicesWithStatus.filter(d => d.status === 'online').length;
    const offlineCount = devicesWithStatus.filter(d => d.status === 'offline').length;

    state.metrics = {
      ...state.metrics,
      onlineDevices: onlineCount,
      offlineDevices: offlineCount,
    };

    updateDeviceStatusUI(devicesWithStatus);
  });

  const unsubPlaylists = subscribeToPlaylists((playlistsData) => {
    state.playlists = playlistsData;
    state.alerts = buildOperationalAlerts(state.savedAlerts);
    if (shouldRenderRealtimeUpdate(['dashboard', 'playlists', 'geofencing', 'campaignReports'])) {
      render();
    }
  });

  const unsubConnectionRequests = subscribeToConnectionRequests((requests) => {
    state.connectionError = '';
    const pendingRequests = requests.filter(r => r.status === 'pending');
    pendingRequests.forEach((request) => {
      if (state.knownConnectionRequestIds.has(request.id)) return;

      state.knownConnectionRequestIds.add(request.id);
      notifyDiscord({
        title: 'Nova conexão pendente',
        description: 'Um tablet solicitou conexão com o SponsorGo Central.',
        color: 0xf2994a,
        fields: [
          { name: 'Código', value: request.id },
          { name: 'Status', value: request.status || 'pending' },
        ],
      });
    });
    state.connectionRequests = pendingRequests;
    if (shouldRenderRealtimeUpdate(['dashboard', 'connections'])) {
      render();
    }
  }, (error) => {
    console.error('Erro ao acompanhar conexões:', error);
    state.connectionError = error?.message || 'Não foi possível consultar as conexões no Firebase.';
    if (shouldRenderRealtimeUpdate(['dashboard', 'connections'])) {
      render();
    }
  });

  const unsubHours = subscribeToHours((hoursData) => {
    console.log('Horas recebidas do Firebase:', hoursData);
    state.allHoursData = hoursData;
    state.hoursData = hoursData;
    if (state.route === 'hours') {
      render();
    }
  });

  const presenceTimer = window.setInterval(() => {
    const normalized = normalizeDevicesStatus(state.devices);
    const changed = normalized.some((device, index) => device.status !== state.devices[index]?.status);
    if (!changed) return;

    state.devices = normalized;
    state.metrics = {
      ...state.metrics,
      onlineDevices: normalized.filter((device) => device.status === 'online').length,
      offlineDevices: normalized.filter((device) => device.status === 'offline').length,
    };
    state.alerts = buildOperationalAlerts(state.savedAlerts);
    if (shouldRenderRealtimeUpdate(['dashboard', 'devices', 'monitor', 'map', 'connections'])) {
      render();
    }
  }, PRESENCE_REFRESH_MS);

  state.unsubscribe = () => {
    unsubDevices();
    unsubPlaylists();
    unsubConnectionRequests();
    unsubHours();
    window.clearInterval(presenceTimer);
  };
}

function updateDeviceStatusUI(devices) {
  const view = document.querySelector('#view');
  if (!view) return;

  if (state.route === 'map') {
    const selectedDevices = state.mapFilters.deviceId === 'all'
      ? devices
      : devices.filter((device) => device.id === state.mapFilters.deviceId);
    window.mapDevicesData = buildMapDevicesData(selectedDevices);
    
    console.log('updateDeviceStatusUI - map data updated, scheduling initMap');
    setTimeout(initMap, 500);
    return;
  }

  devices.forEach(device => {
    const row = view.querySelector(`[data-device-id="${escapeCssValue(device.id)}"]`);
    if (row) {
      const statusEl = row.querySelector('.status');
      if (statusEl) {
        const statusText = device.status === 'online' ? 'Ativo' : 'Parado';
        statusEl.textContent = statusText;
        statusEl.className = `status ${safeCssClass(device.status, 'offline')}`;
      }

      row.querySelectorAll('[data-current-video]').forEach((videoEl) => {
        videoEl.textContent = getDeviceCurrentVideoTitle(device);
      });
    }
  });

  updateMetricsCards(view, state.metrics);
}

async function bindHoursView() {
  if (state.route !== 'hours') return;

  const filterPeriod = document.getElementById('filter-period');
  const filterDateStart = document.getElementById('filter-date-start');
  const filterDateEnd = document.getElementById('filter-date-end');
  const filterDevice = document.getElementById('filter-device');
  const exportBtn = document.getElementById('export-hours-btn');

  if (!filterDateStart || !filterDateEnd) return;

  const updateCustomDateVisibility = () => {
    const display = filterPeriod?.value === 'custom' ? 'inline-block' : 'none';
    filterDateStart.style.display = display;
    filterDateEnd.style.display = display;
  };
  updateCustomDateVisibility();

  if (filterPeriod) {
    filterPeriod.addEventListener('change', async (e) => {
      updateCustomDateVisibility();
      await applyHoursFilter();
    });
  }

  if (filterDateStart) {
    filterDateStart.addEventListener('change', applyHoursFilter);
    filterDateEnd.addEventListener('change', applyHoursFilter);
  }

  if (filterDevice) {
    filterDevice.addEventListener('change', applyHoursFilter);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const data = await exportHoursToExcel(getFilteredHoursData(), state.devices);
      if (data && data.length > 0) {
        const timestamp = getLocalDateString();
        exportToExcel({ hoursReport: data }, `relatorio-horas-${timestamp}`);
        showToast('Relatório Exportado', 'O arquivo Excel foi baixado com sucesso.', 'success');
      } else {
        showToast('Sem dados', 'Não há dados para exportar no período selecionado.', 'warning');
      }
    });
  }

  document.querySelectorAll('[data-dismiss-alert]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const alertId = btn.dataset.dismissAlert;
      try {
        await dismissAlert(alertId);
        state.savedAlerts = state.savedAlerts.filter(a => a.id !== alertId);
        state.alerts = buildOperationalAlerts(state.savedAlerts);
        btn.closest('.alert-item')?.remove();
        showToast('Alerta dispensado', 'O alerta foi removido da lista.', 'success');
      } catch (error) {
        showToast('Erro', 'Não foi possível dispensar o alerta.', 'error');
      }
    });
  });
}

async function bindCampaignReportsView() {
  if (state.route !== 'campaignReports') return;

  const period = document.getElementById('campaign-period');
  const startDate = document.getElementById('campaign-date-start');
  const endDate = document.getElementById('campaign-date-end');
  const playlist = document.getElementById('campaign-playlist');
  const applyBtn = document.getElementById('campaign-apply');
  const exportBtn = document.getElementById('campaign-export');

  const updateCustomDateVisibility = () => {
    const display = period?.value === 'custom' ? 'inline-block' : 'none';
    document.querySelectorAll('.campaign-custom-date').forEach((input) => {
      input.style.display = display;
    });
  };

  const applyFilters = async () => {
    state.campaignFilters = {
      period: period?.value || 'today',
      playlistId: playlist?.value || '',
      startDate: startDate?.value || '',
      endDate: endDate?.value || '',
    };

    showLoading('Carregando relatórios...');
    await loadCampaignReports();
    hideLoading();
    render();
  };

  updateCustomDateVisibility();

  period?.addEventListener('change', () => {
    updateCustomDateVisibility();
  });
  applyBtn?.addEventListener('click', applyFilters);
  playlist?.addEventListener('change', applyFilters);
  startDate?.addEventListener('change', () => {
    if (period?.value === 'custom') applyFilters();
  });
  endDate?.addEventListener('change', () => {
    if (period?.value === 'custom') applyFilters();
  });

  exportBtn?.addEventListener('click', async () => {
    const selectedPlaylistId = state.campaignFilters.playlistId || '';
    const metrics = selectedPlaylistId
      ? state.campaignMetrics.filter((item) => item.playlistId === selectedPlaylistId)
      : state.campaignMetrics;
    const proofs = selectedPlaylistId
      ? state.playbackProofs.filter((item) => item.playlistId === selectedPlaylistId)
      : state.playbackProofs;

    const rows = await exportCampaignReportRows(metrics, proofs);
    if (!rows.campaignRows.length && !rows.proofRows.length) {
      showToast('Sem dados', 'Não há relatórios para exportar nesse período.', 'warning');
      return;
    }

    exportToExcel({
      campanhas: rows.campaignRows,
      comprovantes: rows.proofRows,
    }, `relatorio-campanhas-${getLocalDateString()}`);
    showToast('Relatório exportado', 'A planilha de campanhas foi baixada.', 'success');
  });
}

async function applyHoursFilter() {
  const filterPeriod = document.getElementById('filter-period');
  const filterDateStart = document.getElementById('filter-date-start');
  const filterDateEnd = document.getElementById('filter-date-end');
  const filterDevice = document.getElementById('filter-device');

  if (!filterPeriod) return;

  state.hoursFilters = {
    period: filterPeriod.value,
    deviceId: filterDevice?.value || '',
    startDate: filterDateStart?.value || '',
    endDate: filterDateEnd?.value || '',
  };

  if (state.allHoursData.length === 0) {
    const localToday = getLocalDateString();
    state.allHoursData = await fetchHoursByDateRange(localToday, localToday);
  }

  render();
}

function updateMetricsCards(view, metrics) {
  if (!view || !metrics) return;
  
  const cards = view.querySelectorAll('.card');
  cards.forEach(card => {
    const label = card.querySelector('.metric-label');
    if (!label) return;
    
    const text = label.textContent || '';
    const value = card.querySelector('.metric-value');
    if (!value) return;
    
    if (text.includes('Ativo') || text.includes('Online')) {
      value.textContent = metrics.onlineDevices;
    } else if (text.includes('Parado') || text.includes('Offline') || text.includes('Inativo')) {
      value.textContent = metrics.offlineDevices;
    }
  });
}

function bindExportButton() {
  const exportBtn = document.getElementById('export-excel-btn');
  if (!exportBtn) return;
  
  exportBtn.addEventListener('click', () => {
    exportToExcel(state, 'relatorio-sponsorgo');
    showToast('Relatório Exportado', 'O arquivo Excel foi baixado com sucesso.', 'success');
  });
}

if (hasFirebaseConfig && auth) {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    if (user) {
      await loadData();
      setupRealtimeListeners();
    } else {
      state.unsubscribe?.();
      state.unsubscribe = null;
      state.devices = [];
      state.videos = [];
      state.playlists = [];
      state.geofenceRules = [];
      state.connectionRequests = [];
      state.hoursData = [];
      state.allHoursData = [];
      state.loading = false;
    }
    render();
  });
} else {
  state.loading = false;
  render();
}

setTimeout(() => {
  if (state.loading) {
    state.loading = false;
    render();
  }
}, 5000);
