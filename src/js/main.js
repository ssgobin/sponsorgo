import { loginTemplate, appTemplate } from './templates.js';
import { dashboardView, devicesView, videosView, playlistsView, monitorView, mapView, settingsView, connectionsView, hoursView } from './views.js';
import { hasFirebaseConfig, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, addDevice, addVideoMetadata, addPlaylist, fetchCollection, deleteDocument, assignPlaylistToDevice, unassignPlaylistFromDevice, subscribeToDevices, subscribeToPlaylists, subscribeToConnectionRequests, updateDevice, updatePlaylist, approveConnectionRequest } from './firebase.js';
import { hasAppwriteConfig, uploadVideo, deleteVideoFile } from './appwrite.js';
import { exportToExcel } from './export-excel.js';
import { fetchTodayHours, fetchMonthHours, fetchActiveAlerts, fetchHoursByDateRange, fetchHoursByDevice, dismissAlert, checkAndCreateAlerts, exportHoursToExcel, initHoursFirebase } from './firebase-hours.js';

const app = document.querySelector('#app');
const isDemo = !(hasFirebaseConfig && hasAppwriteConfig);

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
  connectionRequests: [],
  activity: [],
  hoursData: [],
  alerts: [],
  loading: true,
  unsubscribe: null,
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getPlaylistVideoIds(playlist) {
  return toArray(playlist?.videos)
    .map((video) => typeof video === 'string' ? video : (video?.id || video?.title || video?.name || ''))
    .filter(Boolean);
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
      active: true
    }));
}

function findDevicePlaylistConflicts(selectedDeviceIds, currentPlaylistId = null) {
  const selected = new Set(selectedDeviceIds);

  return state.playlists
    .filter((playlist) => playlist.id !== currentPlaylistId && !playlist.deletedAt)
    .filter((playlist) => getPlaylistDeviceIds(playlist).some((deviceId) => selected.has(deviceId)))
    .map((playlist) => playlist.name || playlist.id);
}

async function syncPlaylistAssignments(playlistId, previousDeviceIds, selectedDeviceIds) {
  const previous = new Set(previousDeviceIds);
  const selected = new Set(selectedDeviceIds);

  for (const deviceId of selected) {
    await assignPlaylistToDevice(deviceId, playlistId);
  }

  for (const deviceId of previous) {
    if (!selected.has(deviceId)) {
      await unassignPlaylistFromDevice(deviceId, playlistId);
    }
  }
}

const navItems = [
  { key: 'dashboard', label: 'Visão Geral', icon: '◫' },
  { key: 'devices', label: 'Tablets', icon: '▣' },
  { key: 'connections', label: 'Conexões', icon: '🔗' },
  { key: 'hours', label: 'Horas', icon: '⏱' },
  { key: 'videos', label: 'Vídeos', icon: '▶' },
  { key: 'playlists', label: 'Playlists', icon: '≣' },
  { key: 'monitor', label: 'Monitoramento', icon: '◌' },
  { key: 'map', label: 'Mapa', icon: '🗺' },
  { key: 'settings', label: 'Configurações', icon: '⚙' },
];

function showToast(title, message, type = 'info') {
  const container = document.querySelector('.toast-container') || createToastContainer();
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
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
    <p>${message}</p>
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
    const [devicesData, videosData, playlistsData, connectionRequestsData, hoursData, alertsData] = await Promise.all([
      fetchCollection('devices'),
      fetchCollection('videos'),
      fetchCollection('playlists'),
      fetchCollection('connectionRequests'),
      fetchTodayHours(),
      fetchActiveAlerts()
    ]);

    const now = Date.now();
    const ONLINE_THRESHOLD = 2 * 60 * 1000;

    const devicesWithStatus = devicesData.map(d => {
      const lastHeartbeat = d.lastHeartbeat;
      let computedStatus = 'offline';
      
      if (lastHeartbeat) {
        const timestamp = lastHeartbeat.toDate ? lastHeartbeat.toDate().getTime() : (typeof lastHeartbeat === 'number' ? lastHeartbeat : 0);
        computedStatus = (now - timestamp < ONLINE_THRESHOLD) ? 'online' : 'offline';
      }
      
      return { ...d, status: computedStatus };
    });

    state.devices = devicesWithStatus;
    state.videos = videosData;
    state.playlists = playlistsData;
    state.connectionRequests = connectionRequestsData.filter(r => r.status === 'pending');
    state.hoursData = hoursData;
    state.alerts = alertsData;

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
  nav.innerHTML = navItems.map((item) => `
    <button class="nav-button ${state.route === item.key ? 'active' : ''}" data-route="${item.key}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </button>
  `).join('');
}

function renderView() {
  const view = document.querySelector('#view');
  const payload = { ...state, isDemo };

  const views = {
    dashboard: dashboardView(payload),
    devices: devicesView(payload),
    connections: connectionsView(payload),
    hours: hoursView(payload),
    videos: videosView(payload),
    playlists: playlistsView(payload),
    monitor: monitorView(payload),
    map: mapView(payload),
    settings: settingsView(payload, isDemo),
  };

  view.innerHTML = views[state.route] || views.dashboard;
  bindForms();
  bindHoursView();
  
  if (state.route === 'map') {
    console.log('renderView - route is map, scheduling initMap');
    setTimeout(initMap, 500);
  }
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
  
  if (window.map && window.mapMarkersLayer) {
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
    }
  }
  
  try {
    console.log('Creating new map');
    const map = window.L.map('map', { preferCanvas: true });
    map.setView(DEFAULT_CENTER, 13);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    
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
    data: window.mapDevicesData?.length
  });
  
  if (!window.map || !window.mapMarkersLayer) {
    console.log('No map or layer, skipping');
    return;
  }
  
  try {
    window.mapMarkersLayer.clearLayers();
  } catch(e) {
    console.log('Error clearing layers:', e);
  }
  
  const devices = window.mapDevicesData || [];
  
  if (devices.length === 0) {
    console.log('No device data');
    window.map.setView(DEFAULT_CENTER, 13);
    return;
  }
  
  const bounds = [];
  
  devices.forEach((device) => {
    if (device.lat != null && device.lng != null) {
      const isOnline = device.status === 'online';
      const icon = window.L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          background: ${isOnline ? '#4CAF50' : '#9E9E9E'};
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        ">🚗</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      
      const marker = window.L.marker([device.lat, device.lng], { icon })
        .addTo(window.mapMarkersLayer)
        .bindPopup(`
          <div style="min-width: 150px;">
            <strong>${device.name}</strong><br/>
            <span>${device.car || 'Sem veículo'}</span><br/>
            <span>${device.driver || 'Sem motorista'}</span><br/>
            <span style="color: ${isOnline ? 'green' : 'gray'}">● ${isOnline ? 'Online' : 'Offline'}</span>
          </div>
        `);
      
      bounds.push([device.lat, device.lng]);
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
      notice.className = 'notice error';
      notice.textContent = error.message || 'Não foi possível fazer login.';
    }
  });
}

function bindAppEvents() {
  document.querySelector('#nav')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-route]');
    if (!button) return;
    state.route = button.dataset.route;
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
  bindDeleteButtons();
  bindEditButtons();
  bindFileInput();
  bindExportButton();
  bindConnectButtons();
}

function bindFileInput() {
  const fileInput = document.getElementById('video-file');
  if (!fileInput) return;
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const container = fileInput.closest('.file-upload');
    const textEl = container.querySelector('.file-text');
    
    if (file) {
      container.classList.add('has-file');
      textEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    } else {
      container.classList.remove('has-file');
      textEl.textContent = 'Clique para selecionar um vídeo';
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
    'playlist': 'playlist'
  };
  
  const icons = {
    'tablet': '▣',
    'vídeo': '▶',
    'playlist': '≣'
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
    const deletedPlaylist = type === 'playlist'
      ? state.playlists.find((playlist) => playlist.id === id)
      : null;
    if (type === 'vídeo' && fileId && hasAppwriteConfig) {
      await deleteVideoFile(fileId);
    }

    if (hasFirebaseConfig) {
      const collectionMap = {
        'tablet': 'devices',
        'vídeo': 'videos',
        'playlist': 'playlists',
      };
      await deleteDocument(collectionMap[type], id);

      if (type === 'playlist') {
        for (const deviceId of getPlaylistDeviceIds(deletedPlaylist)) {
          await unassignPlaylistFromDevice(deviceId, id);
        }
      }
    }

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
          <input class="input" name="name" value="${device.name || ''}" required />
        </div>
        <div class="form-group">
          <label>Veículo</label>
          <input class="input" name="car" value="${device.car || ''}" />
        </div>
        <div class="form-group">
          <label>Motorista</label>
          <input class="input" name="driver" value="${device.driver || ''}" />
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
        <input type="checkbox" name="videos" value="${video.id}" ${isChecked} />
        <span class="checkbox-box">✓</span>
        <span class="checkbox-label">${video.title}</span>
      </label>
    `;
  }).join('');

  const deviceCheckboxItems = state.devices.map(device => {
    const isChecked = currentDeviceIds.includes(device.id) ? 'checked' : '';
    return `
      <label class="checkbox-item">
        <input type="checkbox" name="devices" value="${device.id}" ${isChecked} />
        <span class="checkbox-box">✓</span>
        <span class="checkbox-label">${device.name}</span>
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
          <input class="input" name="name" value="${playlist.name || ''}" required />
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

    const conflicts = findDevicePlaylistConflicts(selectedDeviceIds, playlistId);
    if (conflicts.length > 0) {
      showToast('Tablet jÃ¡ em uso', `Remova o tablet da playlist ${conflicts.join(', ')} antes de salvar.`, 'warning');
      return;
    }

    const videosWithMeta = buildPlaylistVideos(selectedVideoIds);

    const payload = {
      name: String(e.target.querySelector('[name="name"]').value).trim(),
      videos: videosWithMeta,
      devices: selectedDeviceIds,
    };

    try {
      if (hasFirebaseConfig) {
        await updatePlaylist(playlistId, payload);
        await syncPlaylistAssignments(playlistId, currentDeviceIds, selectedDeviceIds);
      }
      modal.remove();
      await loadData();
      render();
      showToast('Salvo', 'Playlist atualizada com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao editar playlist:', error);
      showToast('Erro', 'Não foi possível salvar a playlist.', 'error');
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

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <span class="modal-icon info">🔗</span>
      <h3>Conectar Tablet</h3>
      <p>Configure o dispositivo: <strong>${deviceId}</strong></p>
      <form id="connect-device-form">
        <div class="form-group">
          <label>Nome do Tablet</label>
          <input class="input" name="name" value="${existingDevice?.name || ''}" placeholder="Tablet Corolla 01" required />
        </div>
        <div class="form-group">
          <label>Veículo</label>
          <input class="input" name="car" value="${existingDevice?.car || ''}" placeholder="Toyota Corolla" />
        </div>
        <div class="form-group">
          <label>Motorista</label>
          <input class="input" name="driver" value="${existingDevice?.driver || ''}" placeholder="João Silva" />
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
      createdAt: new Date(),
    };

    try {
      showLoading('Conectando...');

      if (hasFirebaseConfig) {
        await updateDevice(deviceId, payload);
        await approveConnectionRequest(deviceId, { approvedBy: state.user?.email || 'admin' });
      }

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const file = formData.get('file');
    const payload = {
      title: String(formData.get('title')).trim(),
      duration: String(formData.get('duration')).trim(),
      status: String(formData.get('status')).trim(),
    };

    try {
      showLoading('Enviando vídeo...');
      
      let uploadedMeta = {
        fileName: file?.name || 'arquivo.mp4',
        size: file ? `${Math.round(file.size / (1024 * 1024))} MB` : '—',
      };

      if (hasAppwriteConfig && file) {
        const upload = await uploadVideo(file);
        uploadedMeta = {
          fileName: upload.fileName,
          size: `${Math.round(upload.sizeOriginal / (1024 * 1024))} MB`,
          fileId: upload.fileId,
        };
      }

      if (hasFirebaseConfig) {
        await addVideoMetadata({ ...payload, ...uploadedMeta });
      }

      hideLoading();
      await loadData();
      showToast('Vídeo Enviado', `${payload.title} foi adicionado à biblioteca.`, 'success');
      form.reset();
      render();
    } catch (error) {
      hideLoading();
      showToast('Erro', error.message || 'Não foi possível enviar o vídeo.', 'error');
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
      showToast('Tablet jÃ¡ em uso', `Remova o tablet da playlist ${conflicts.join(', ')} antes de criar outra.`, 'warning');
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
        const playlistId = await addPlaylist(payload);
        await syncPlaylistAssignments(playlistId, [], selectedDeviceIds);
      }
      
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
    const now = Date.now();
    const ONLINE_THRESHOLD = 2 * 60 * 1000;

    const devicesWithStatus = devicesData.map(d => {
      const lastHeartbeat = d.lastHeartbeat;
      let computedStatus = 'offline';

      if (lastHeartbeat) {
        const timestamp = lastHeartbeat.toDate ? lastHeartbeat.toDate().getTime() : (typeof lastHeartbeat === 'number' ? lastHeartbeat : 0);
        computedStatus = (now - timestamp < ONLINE_THRESHOLD) ? 'online' : 'offline';
      }

      return { ...d, status: computedStatus };
    });

    state.devices = devicesWithStatus;

    const onlineCount = devicesWithStatus.filter(d => d.status === 'online').length;
    const offlineCount = devicesWithStatus.filter(d => d.status === 'offline').length;

    state.metrics = {
      ...state.metrics,
      onlineDevices: onlineCount,
      offlineDevices: offlineCount,
    };

    updateDeviceStatusUI(devicesWithStatus);
    render();
  });

  const unsubPlaylists = subscribeToPlaylists((playlistsData) => {
    state.playlists = playlistsData;
    render();
  });

  const unsubConnectionRequests = subscribeToConnectionRequests((requests) => {
    const pendingRequests = requests.filter(r => r.status === 'pending');
    state.connectionRequests = pendingRequests;
    render();
  });

  state.unsubscribe = () => {
    unsubDevices();
    unsubPlaylists();
    unsubConnectionRequests();
  };
}

function updateDeviceStatusUI(devices) {
  const view = document.querySelector('#view');
  if (!view) return;

  if (state.route === 'map') {
    window.mapDevicesData = devices.filter(d => d.location && d.location.latitude != null && d.location.longitude != null).map(d => ({
      id: d.id,
      name: d.name || d.id,
      car: d.car || '',
      driver: d.driver || '',
      status: d.status || 'offline',
      lat: d.location.latitude,
      lng: d.location.longitude,
      accuracy: d.location.accuracy || 0,
      lastUpdate: d.location.timestamp ? new Date(d.location.timestamp).toLocaleString('pt-BR') : '—'
    }));
    
    console.log('updateDeviceStatusUI - map data updated, scheduling initMap');
    setTimeout(initMap, 500);
    return;
  }

  devices.forEach(device => {
    const row = view.querySelector(`[data-device-id="${device.id}"]`);
    if (row) {
      const statusEl = row.querySelector('.status');
      if (statusEl) {
        const statusText = device.status === 'online' ? 'Ativo' : 'Parado';
        statusEl.textContent = statusText;
        statusEl.className = `status ${device.status || 'offline'}`;
      }
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

  filterDateStart.style.display = 'none';
  filterDateEnd.style.display = 'none';

  if (filterPeriod) {
    filterPeriod.addEventListener('change', async (e) => {
      const period = e.target.value;
      
      if (period === 'custom') {
        filterDateStart.style.display = 'inline-block';
        filterDateEnd.style.display = 'inline-block';
      } else {
        filterDateStart.style.display = 'none';
        filterDateEnd.style.display = 'none';
      }

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
      const data = await exportHoursToExcel(state.hoursData, state.devices);
      if (data && data.length > 0) {
        const timestamp = new Date().toISOString().split('T')[0];
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
        state.alerts = state.alerts.filter(a => a.id !== alertId);
        btn.closest('.alert-item')?.remove();
        showToast('Alerta dispensado', 'O alerta foi removido da lista.', 'success');
      } catch (error) {
        showToast('Erro', 'Não foi possível dispensar o alerta.', 'error');
      }
    });
  });
}

async function applyHoursFilter() {
  if (!hasFirebaseConfig) return;

  const filterPeriod = document.getElementById('filter-period');
  const filterDateStart = document.getElementById('filter-date-start');
  const filterDateEnd = document.getElementById('filter-date-end');
  const filterDevice = document.getElementById('filter-device');

  if (!filterPeriod) return;

  const period = filterPeriod.value;
  const deviceId = filterDevice?.value || '';
  const today = new Date().toISOString().split('T')[0];

  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = endDate = today;
      break;
    case 'week':
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split('T')[0];
      endDate = today;
      break;
    case 'month':
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      break;
    case 'custom':
      startDate = filterDateStart?.value || today;
      endDate = filterDateEnd?.value || today;
      break;
  }

  try {
    let filteredData;
    
    if (deviceId) {
      filteredData = await fetchHoursByDevice(deviceId, startDate, endDate);
    } else {
      filteredData = await fetchHoursByDateRange(startDate, endDate);
    }

    state.hoursData = filteredData;
    render();
  } catch (error) {
    console.error('Erro ao filtrar horas:', error);
    showToast('Erro', 'Não foi possível filtrar os dados.', 'error');
  }
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
