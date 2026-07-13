import { layoutView } from './templates.js';
import { exportToExcel } from './export-excel.js';
import { DAILY_GOAL_HOURS } from './firebase-hours.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function safeCssClass(value, fallback = '') {
  const text = String(value ?? fallback);
  return /^[a-z0-9_-]+$/i.test(text) ? text : fallback;
}

const DEFAULT_PAGE_SIZE = 8;

function getPageInfo(data, scope, totalItems) {
  const pagination = data.pagination?.[scope] || {};
  const pageSize = Math.max(4, Number(pagination.pageSize || DEFAULT_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(Number(pagination.page || 1), 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);

  return { currentPage, pageSize, totalPages, start, end, totalItems };
}

function renderPagination(scope, pageInfo) {
  if (!pageInfo.totalItems) return '';

  const pageButtons = Array.from({ length: pageInfo.totalPages }, (_, index) => index + 1)
    .filter((page) => (
      page === 1 ||
      page === pageInfo.totalPages ||
      Math.abs(page - pageInfo.currentPage) <= 1
    ))
    .reduce((items, page, index, pages) => {
      if (index > 0 && page - pages[index - 1] > 1) {
        items.push('<span class="pagination-ellipsis">...</span>');
      }
      items.push(`
        <button class="pagination-page ${page === pageInfo.currentPage ? 'active' : ''}" data-pagination-scope="${scope}" data-page="${page}" type="button" ${page === pageInfo.currentPage ? 'aria-current="page"' : ''}>
          ${page}
        </button>
      `);
      return items;
    }, [])
    .join('');

  return `
    <div class="pagination" aria-label="Paginação">
      <p class="pagination-summary">
        Exibindo <strong>${pageInfo.start + 1}-${pageInfo.end}</strong> de <strong>${pageInfo.totalItems}</strong>
      </p>
      <div class="pagination-controls">
        <button class="pagination-button" data-pagination-scope="${scope}" data-page="${pageInfo.currentPage - 1}" type="button" ${pageInfo.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <div class="pagination-pages">${pageButtons}</div>
        <button class="pagination-button" data-pagination-scope="${scope}" data-page="${pageInfo.currentPage + 1}" type="button" ${pageInfo.currentPage >= pageInfo.totalPages ? 'disabled' : ''}>Próxima</button>
        <select class="select pagination-size" data-pagination-size="${scope}" aria-label="Itens por página">
          ${[4, 8, 12, 20].map((size) => `<option value="${size}" ${pageInfo.pageSize === size ? 'selected' : ''}>${size}/página</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCoordinate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasDeviceLocation(device = {}) {
  const location = device.location || device.currentLocation || device.lastLocation || device.gps || {};
  const latitude = normalizeCoordinate(location.latitude ?? location.lat ?? device.latitude ?? device.lat);
  const longitude = normalizeCoordinate(
    location.longitude ?? location.lng ?? location.lon ?? location.long ?? device.longitude ?? device.lng ?? device.lon ?? device.long
  );
  return latitude != null && longitude != null;
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp.toDate) {
    const date = timestamp.toDate();
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 60000) return 'Agora mesmo';
    if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `há ${Math.floor(diff / 3600000)}h`;
    return date.toLocaleString('pt-BR');
  }
  if (typeof timestamp === 'number') {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'Agora mesmo';
    if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `há ${Math.floor(diff / 3600000)}h`;
    return new Date(timestamp).toLocaleString('pt-BR');
  }
  return '—';
}

function formatDeviceStatus(status) {
  if (status === 'online') return 'Ativo';
  if (status === 'offline') return 'Parado';
  if (status === 'syncing') return 'Sincronizando';
  return status || '—';
}

function getDeviceCurrentVideoTitle(device, videos = []) {
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

function countItems(value) {
  return Array.isArray(value) ? value.length : Number(value) || 0;
}

export function dashboardView(data) {
  const { metrics, devices, activity, isDemo, videos } = data;

  const hasData = devices.length > 0 || metrics.onlineDevices > 0;

  const getVideoTitle = (videoId) => {
    if (!videoId) return '—';
    const video = videos?.find(v => v.id === videoId);
    return video?.title || videoId;
  };

  const cards = `
    <section class="grid-4">
      <article class="card">
        <div class="metric">
          <span class="metric-label">Tablets Ativos</span>
          <strong class="metric-value">${metrics.onlineDevices}</strong>
          <span class="metric-trend ${metrics.onlineDevices > 0 ? 'success' : ''}">${metrics.onlineDevices > 0 ? 'Reproduzindo conteúdo' : 'Nenhum online'}</span>
        </div>
      </article>
      <article class="card">
        <div class="metric">
          <span class="metric-label">Tablets Parados</span>
          <strong class="metric-value">${metrics.offlineDevices}</strong>
          <span class="metric-trend ${metrics.offlineDevices > 0 ? 'danger' : ''}">${metrics.offlineDevices > 0 ? 'Precisa verificar' : 'Nenhum parado'}</span>
        </div>
      </article>
      <article class="card">
        <div class="metric">
          <span class="metric-label">Atualizados Hoje</span>
          <strong class="metric-value">${metrics.syncedToday}</strong>
          <span class="metric-trend success">Playlists sincronizadas</span>
        </div>
      </article>
      <article class="card">
        <div class="metric">
          <span class="metric-label">Vídeos Disponíveis</span>
          <strong class="metric-value">${metrics.activeVideos}</strong>
          <span class="metric-trend">Na biblioteca</span>
        </div>
      </article>
    </section>
  `;

  const deviceRows = devices.map((device) => {
    const lastContact = device.lastHeartbeat 
      ? (device.lastHeartbeat.toDate ? device.lastHeartbeat.toDate() : new Date(device.lastHeartbeat))
      : null;
    return `
    <tr data-device-id="${escapeAttr(device.id)}">
      <td><strong>${escapeHtml(device.name || '—')}</strong><div class="card-subtitle">${escapeHtml(device.id || '—')}</div></td>
      <td>${escapeHtml(device.car || '—')}</td>
      <td><span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span></td>
      <td data-current-video>${escapeHtml(getDeviceCurrentVideoTitle(device, videos))}</td>
      <td>${formatDate(lastContact) || '—'}</td>
      <td>${device.battery >= 0 ? `${device.battery}%` : '—'}</td>
      <td style="width:80px;">
        <button class="button-edit" data-edit="tablet" data-id="${escapeAttr(device.id)}" title="Editar">✎</button>
        <button class="button-delete" data-delete="tablet" data-id="${escapeAttr(device.id)}" title="Excluir">✕</button>
      </td>
    </tr>
  `}).join('');

  const activities = activity.length > 0 ? activity.map((item) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${escapeHtml(item.title || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(item.detail || '—')}</p>
      </div>
      <span class="pill">${escapeHtml(item.when || '—')}</span>
    </div>
  `).join('') : '<div class="empty-state"><h3>Nenhuma atividade recente</h3><p>As atividades vão aparecer aqui quando os tablets interagirem.</p></div>';

  const noDataMessage = isDemo 
    ? 'Configure o Firebase para ver os dados reais.' 
    : 'Nenhum tablet encontrado. Cadastre na aba Tablets.';

  return layoutView(
    'Visão Geral',
    isDemo 
      ? 'Você está em modo demonstração. Configure o Firebase para ver dados reais.' 
      : 'Resumo do que está acontecendo com seus tablets.',
    `
      ${cards}
      <section class="grid-2" style="margin-top: 20px;">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Status dos Tablets</h3>
              <p class="card-subtitle">Veja quais estão funcionando</p>
            </div>
          </div>
          ${hasData ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tablet</th>
                    <th>Veículo</th>
                    <th>Status</th>
                    <th>Vídeo</th>
                    <th>Último Contato</th>
                    <th>Bateria</th>
                    <th style="width:50px;"></th>
                  </tr>
                </thead>
                <tbody>${deviceRows}</tbody>
              </table>
            </div>
          ` : `
            <div class="empty-state">
              <h3>Nenhum tablet</h3>
              <p>${noDataMessage}</p>
            </div>
          `}
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Atividade Recente</h3>
              <p class="card-subtitle">O que aconteceu agora</p>
            </div>
          </div>
          <div class="list">${activities}</div>
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function devicesView(data) {
  const allowManualDeviceForm = Boolean(data.isDemo);
  const filters = data.listFilters?.devices || { search: '', status: '' };
  const allDevices = data.filteredDevices || data.devices;
  const pageInfo = getPageInfo(data, 'devices', allDevices.length);
  const devices = allDevices.slice(pageInfo.start, pageInfo.end);
  const videos = data.videos || [];
  const items = devices.length > 0 ? devices.map((device) => `
    <div class="list-item" data-device-id="${escapeAttr(device.id)}">
      <div>
        <p class="list-item-title">${escapeHtml(device.name || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(device.id || '—')} • ${escapeHtml(device.car || 'Sem veículo')} • ${escapeHtml(device.driver || 'Sem motorista')}</p>
        <p class="list-item-subtitle">Vídeo atual: <span data-current-video>${escapeHtml(getDeviceCurrentVideoTitle(device, videos))}</span></p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span>
        ${device.lastStabilityIssue?.type ? `<span class="pill warning" title="${escapeAttr(String(device.lastStabilityIssue.trace || '').slice(0, 500))}">${escapeHtml(device.lastStabilityIssue.type)} detectado</span>` : ''}
        ${device.battery || device.battery === 0 ? `<span class="pill">${device.battery}% bateria</span>` : ''}
        ${device.ownerUid ? `<button class="button compact secondary" data-device-command="SYNC_NOW" data-device-id="${escapeAttr(device.id)}">Sincronizar</button>` : '<span class="pill warning">Identidade pendente</span>'}
        ${device.ownerUid ? `<button class="button-icon" data-device-command="FLUSH_TELEMETRY" data-device-id="${escapeAttr(device.id)}" title="Enviar telemetria agora">↥</button>` : ''}
        <button class="button-edit" data-edit="tablet" data-id="${escapeAttr(device.id)}" title="Editar">✎</button>
        <button class="button-delete" data-delete="tablet" data-id="${escapeAttr(device.id)}" title="Excluir">✕</button>
      </div>
    </div>
  `).join('') : '';

  return layoutView(
    'Tablets',
    'Gerencie os tablets que vão mostrar seus vídeos.',
    `
      <section class="grid-2 management-grid">
        <article class="card form-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Adicionar Novo Tablet</h3>
              <p class="card-subtitle">Dê um nome e identificação para cada tablet</p>
            </div>
          </div>
          ${allowManualDeviceForm ? '' : `
            <div class="empty-state">
              <h3>Use Conexões</h3>
              <p>Abra o app SponsorGo no tablet e aprove a solicitação na aba Conexões. Assim o ID fica igual ao que o app Kotlin usa.</p>
            </div>
          `}
          <form id="device-form" class="list" style="${allowManualDeviceForm ? '' : 'display:none;'}">
            <div class="form-row">
              <div class="form-group"><label>Nome do Tablet</label><input class="input" name="name" placeholder="Tablet Corolla 01" required /></div>
              <div class="form-group"><label>Identificador</label><input class="input" name="deviceCode" placeholder="TAB-001" required /></div>
              <div class="form-group"><label>Veículo</label><input class="input" name="car" placeholder="Toyota Corolla" /></div>
              <div class="form-group"><label>Motorista</label><input class="input" name="driver" placeholder="Carlos" /></div>
            </div>
            <button class="button primary" type="submit">Cadastrar Tablet</button>
          </form>
        </article>
        <article class="card list-card">
          <div class="card-header"><div><h3 class="card-title">Tablets Cadastrados</h3><p class="card-subtitle">${allDevices.length} de ${data.devices.length} tablets encontrados</p></div></div>
          <div class="filter-controls list-filters">
            <input id="devices-search" class="input" data-filter-scope="devices" data-filter-key="search" value="${escapeAttr(filters.search)}" placeholder="Buscar por tablet, veículo ou motorista" />
            <select id="devices-status" class="select" data-filter-scope="devices" data-filter-key="status">
              <option value="" ${!filters.status ? 'selected' : ''}>Todos os status</option>
              <option value="online" ${filters.status === 'online' ? 'selected' : ''}>Ativos</option>
              <option value="offline" ${filters.status === 'offline' ? 'selected' : ''}>Parados</option>
            </select>
          </div>
          ${items ? `<div class="list">${items}</div>${renderPagination('devices', pageInfo)}` : `<div class="empty-state"><h3>Nenhum tablet encontrado</h3><p>Ajuste a busca ou os filtros.</p></div>`}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}
export function videosView(data) {
  const filters = data.listFilters?.videos || { search: '', status: '' };
  const allVideos = data.filteredVideos || data.videos;
  const pageInfo = getPageInfo(data, 'videos', allVideos.length);
  const videos = allVideos.slice(pageInfo.start, pageInfo.end);
  const items = videos.length > 0 ? videos.map((video) => {
    const viewUrl = video.viewUrl || '';
    const downloadUrl = video.downloadUrl || viewUrl;
    return `
    <div class="list-item">
      <div>
        <p class="list-item-title">${escapeHtml(video.title || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(video.fileName || 'arquivo.mp4')} • ${escapeHtml(video.duration || '00:00')} • ${escapeHtml(video.size || '—')}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="pill ${video.status === 'Ativo' || video.status === 'active' ? 'active' : ''}">${escapeHtml(video.status || 'Rascunho')}</span>
        ${viewUrl ? `<a class="button secondary small" href="${escapeAttr(viewUrl)}" target="_blank" rel="noopener">Preview</a>` : ''}
        ${downloadUrl ? `<a class="button secondary small" href="${escapeAttr(downloadUrl)}" download>Download</a>` : ''}
        <button class="button-delete" data-delete="vídeo" data-id="${escapeAttr(video.id)}" data-file-id="${escapeAttr(video.fileId || '')}" title="Excluir">✕</button>
      </div>
    </div>
  `}).join('') : '';

  return layoutView(
    'Vídeos',
    'Adicione vídeos para mostrar nos tablets.',
    `
      <section class="grid-2 management-grid">
        <article class="card form-card">
          <div class="card-header"><div><h3 class="card-title">Enviar Novo Vídeo</h3><p class="card-subtitle">Adicione um vídeo à sua biblioteca</p></div></div>
          <form id="video-form" class="list">
            <div class="form-row"><div class="form-group"><label>Título do Vídeo</label><input class="input" name="title" placeholder="Promo Abril 01" required /></div></div>
            <div class="form-group">
              <label>Arquivo do Vídeo</label>
              <div class="file-upload">
                <input class="file-input" name="file" type="file" accept="video/mp4,.mp4" id="video-file" required />
                <label for="video-file" class="file-label"><span class="file-icon">▣</span><span class="file-text" id="file-name">Clique para selecionar um vídeo</span></label>
              </div>
            </div>
            <div class="upload-progress" id="upload-progress" hidden>
              <div class="upload-progress-header">
                <span id="upload-progress-text">Aguardando arquivo...</span>
                <strong id="upload-progress-percent">0%</strong>
              </div>
              <div class="upload-progress-track"><span id="upload-progress-bar"></span></div>
              <div class="upload-progress-steps" id="upload-progress-steps" aria-label="Etapas do envio">
                <span data-stage="prepare">Preparar</span>
                <span data-stage="upload">Enviar</span>
                <span data-stage="save">Salvar</span>
              </div>
            </div>
            <button class="button primary" type="submit">Enviar Vídeo</button>
          </form>
        </article>
        <article class="card list-card">
          <div class="card-header"><div><h3 class="card-title">Biblioteca de Vídeos</h3><p class="card-subtitle">${allVideos.length} de ${data.videos.length} vídeos encontrados</p></div></div>
          <div class="filter-controls list-filters">
            <input id="videos-search" class="input" data-filter-scope="videos" data-filter-key="search" value="${escapeAttr(filters.search)}" placeholder="Buscar por título ou arquivo" />
            <select id="videos-status" class="select" data-filter-scope="videos" data-filter-key="status">
              <option value="" ${!filters.status ? 'selected' : ''}>Todos os status</option>
              <option value="ativo" ${filters.status === 'ativo' ? 'selected' : ''}>Ativos</option>
              <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="rascunho" ${filters.status === 'rascunho' ? 'selected' : ''}>Rascunho</option>
            </select>
          </div>
          ${items ? `<div class="list">${items}</div>${renderPagination('videos', pageInfo)}` : `<div class="empty-state"><h3>Nenhum vídeo encontrado</h3><p>Ajuste a busca ou envie um novo vídeo.</p></div>`}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}
export function playlistsView(data) {
  const filters = data.listFilters?.playlists || { search: '', status: '' };
  const allPlaylists = data.filteredPlaylists || data.playlists;
  const pageInfo = getPageInfo(data, 'playlists', allPlaylists.length);
  const playlists = allPlaylists.slice(pageInfo.start, pageInfo.end);
  const items = playlists.length > 0 ? playlists.map((playlist) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${escapeHtml(playlist.name || '—')}</p>
        <p class="list-item-subtitle">${countItems(playlist.videos)} vídeos • ${countItems(playlist.devices)} tablets • ${formatDate(playlist.updatedAt)}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="pill ${playlist.status === 'Ativa' || playlist.status === 'active' ? 'active' : ''}">${escapeHtml(playlist.status || 'Inativa')}</span>
        <button class="button-edit" data-edit="playlist" data-id="${escapeAttr(playlist.id)}" title="Editar">✎</button>
        <button class="button-delete" data-delete="playlist" data-id="${escapeAttr(playlist.id)}" title="Excluir">✕</button>
      </div>
    </div>
  `).join('') : '';

  return layoutView(
    'Playlists',
    'Crie listas de vídeos para os tablets.',
    `
      <section class="grid-2 management-grid">
        <article class="card form-card">
          <div class="card-header"><div><h3 class="card-title">Nova Playlist</h3><p class="card-subtitle">Escolha quais vídeos terão e quais tablets receberão</p></div></div>
          <form id="playlist-form" class="list">
            <div class="form-group"><label>Nome da Playlist</label><input class="input" name="name" placeholder="Campanha Abril" required /></div>
            <div class="form-group">
              <label>Selecionar Vídeos</label>
              <div class="checkbox-list">
                ${data.videos.length > 0 ? data.videos.map((video) => `
                  <label class="checkbox-item">
                    <input type="checkbox" name="videos" value="${escapeAttr(video.id || video.title)}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${escapeHtml(video.title)}</span>
                  </label>
                `).join('') : '<p class="text-muted">Nenhum vídeo disponível</p>'}
              </div>
            </div>
            <div class="form-group">
              <label>Selecionar Tablets</label>
              <div class="checkbox-list">
                ${data.devices.length > 0 ? data.devices.map((device) => `
                    <label class="checkbox-item ${device.ownerUid ? '' : 'is-disabled'}" title="${device.ownerUid ? '' : 'Reconecte este tablet para habilitar a atribuição segura'}">
                      <input type="checkbox" name="devices" value="${escapeAttr(device.id || device.name)}" ${device.ownerUid ? '' : 'disabled'} />
                      <span class="checkbox-box">✓</span>
                      <span class="checkbox-label">${escapeHtml(device.name)}${device.ownerUid ? '' : ' · reconexão necessária'}</span>
                  </label>
                `).join('') : '<p class="text-muted">Nenhum tablet disponível</p>'}
              </div>
            </div>
            <button class="button primary" type="submit">Criar Playlist</button>
          </form>
        </article>
        <article class="card list-card">
          <div class="card-header"><div><h3 class="card-title">Playlists Criadas</h3><p class="card-subtitle">${allPlaylists.length} de ${data.playlists.length} playlists encontradas</p></div></div>
          <div class="filter-controls list-filters">
            <input id="playlists-search" class="input" data-filter-scope="playlists" data-filter-key="search" value="${escapeAttr(filters.search)}" placeholder="Buscar por nome" />
            <select id="playlists-status" class="select" data-filter-scope="playlists" data-filter-key="status">
              <option value="" ${!filters.status ? 'selected' : ''}>Todos os status</option>
              <option value="ativa" ${filters.status === 'ativa' ? 'selected' : ''}>Ativas</option>
              <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inativa" ${filters.status === 'inativa' ? 'selected' : ''}>Inativas</option>
            </select>
          </div>
          ${items ? `<div class="list">${items}</div>${renderPagination('playlists', pageInfo)}` : `<div class="empty-state"><h3>Nenhuma playlist encontrada</h3><p>Ajuste a busca ou crie uma nova playlist.</p></div>`}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function geofencingView(data) {
  const rules = data.geofenceRules || [];
  const playlists = data.playlists || [];
  const filters = data.listFilters?.geofenceRules || { search: '', status: '' };
  const filteredRules = data.filteredGeofenceRules || rules;
  const pageInfo = getPageInfo(data, 'geofenceRules', filteredRules.length);
  const visibleRules = filteredRules.slice(pageInfo.start, pageInfo.end);

  const playlistOptions = playlists.map((playlist) => `
    <option value="${escapeAttr(playlist.id)}">${escapeHtml(playlist.name || playlist.id)}</option>
  `).join('');

  const getPlaylistName = (playlistId) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    return playlist?.name || playlistId || '—';
  };

  const ruleItems = visibleRules.length > 0 ? visibleRules.map((rule) => {
    const location = [
      rule.state ? `UF: ${rule.state}` : '',
      rule.city ? `Cidade: ${rule.city}` : '',
      rule.neighborhood ? `Bairro: ${rule.neighborhood}` : '',
      rule.region ? `Regiao: ${rule.region}` : '',
    ].filter(Boolean).join(' • ');

    return `
      <div class="list-item">
        <div>
          <p class="list-item-title">${escapeHtml(rule.name || 'Regra sem nome')}</p>
          <p class="list-item-subtitle">${escapeHtml(location || 'Localizacao nao definida')}</p>
          <p class="list-item-subtitle">Playlist: ${escapeHtml(getPlaylistName(rule.playlistId))} • Prioridade ${Number(rule.priority || 0)}</p>
        </div>
        <div class="row wrap" style="align-items:center;gap:8px;">
          <span class="pill ${rule.active === false ? '' : 'active'}">${rule.active === false ? 'Inativa' : 'Ativa'}</span>
          <button class="button-delete" data-delete="geofence" data-id="${escapeAttr(rule.id)}" title="Excluir">✕</button>
        </div>
      </div>
    `;
  }).join('') : '';

  return layoutView(
    'Geofencing',
    'Troque playlists automaticamente por estado, cidade, bairro ou regiao.',
    `
      <section class="grid-2 management-grid">
        <article class="card form-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Nova Regra de Região</h3>
              <p class="card-subtitle">A regra mais específica e prioritária vence no tablet</p>
            </div>
          </div>
          <form id="geofence-form" class="list">
            <div class="form-row">
              <div class="form-group"><label>Nome da regra</label><input class="input" name="name" placeholder="Centro - Campanha Almoço" required /></div>
              <div class="form-group">
                <label>Playlist</label>
                <select class="select" name="playlistId" required>
                  <option value="">Selecione uma playlist</option>
                  ${playlistOptions}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Estado</label><input class="input" name="state" placeholder="SP" maxlength="40" /></div>
              <div class="form-group"><label>Cidade</label><input class="input" name="city" placeholder="Americana" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Bairro</label><input class="input" name="neighborhood" placeholder="Centro" /></div>
              <div class="form-group"><label>Região</label><input class="input" name="region" placeholder="Zona Sul, Shopping, Rodovia..." /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Prioridade</label><input class="input" name="priority" type="number" value="0" min="0" max="999" /></div>
              <div class="form-group">
                <label>Status</label>
                <select class="select" name="active">
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </select>
              </div>
            </div>
            <button class="button primary" type="submit">Salvar Regra</button>
          </form>
        </article>
        <article class="card list-card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Regras Cadastradas</h3>
              <p class="card-subtitle">${filteredRules.length} de ${rules.length} regras exibidas</p>
            </div>
          </div>
          <div class="filter-controls list-filters">
            <input id="geofence-search" class="input" data-filter-scope="geofenceRules" data-filter-key="search" value="${escapeAttr(filters.search)}" placeholder="Buscar por nome, cidade, bairro ou playlist" />
            <select id="geofence-status" class="select" data-filter-scope="geofenceRules" data-filter-key="status">
              <option value="" ${!filters.status ? 'selected' : ''}>Todos os status</option>
              <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Ativas</option>
              <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inativas</option>
            </select>
          </div>
          ${ruleItems ? `<div class="list">${ruleItems}</div>${renderPagination('geofenceRules', pageInfo)}` : '<div class="empty-state"><h3>Nenhuma regra encontrada</h3><p>Crie uma regra para trocar campanhas automaticamente por localização.</p></div>'}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}
export function monitorView(data) {
  const rows = data.devices.length > 0 ? data.devices.map((device) => {
    const lastContact = device.lastHeartbeat 
      ? (device.lastHeartbeat.toDate ? device.lastHeartbeat.toDate() : new Date(device.lastHeartbeat))
      : null;
    return `
    <tr data-device-id="${escapeAttr(device.id)}">
      <td><strong>${escapeHtml(device.name || '—')}</strong></td>
      <td><span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span></td>
      <td data-current-video>${escapeHtml(getDeviceCurrentVideoTitle(device, data.videos || []))}</td>
      <td>${formatDate(lastContact) || '—'}</td>
      <td>${device.battery >= 0 ? `${device.battery}%` : '—'}</td>
      <td style="width:50px;"><button class="button-edit" data-edit="tablet" data-id="${escapeAttr(device.id)}" title="Editar">✎</button></td>
    </tr>
  `}).join('') : '';

  const hasData = data.devices.length > 0;
  const onlineCount = data.devices.filter(d => d.status === 'online').length;
  const offlineCount = data.devices.filter(d => d.status === 'offline').length;

  return layoutView(
    'Monitoramento',
    'Acompanhe o que cada tablet está fazendo.',
    `
      <section class="grid-3">
        <article class="card">
          <div class="metric">
            <span class="metric-label">Tablets Ativos</span>
            <strong class="metric-value">${onlineCount}</strong>
            <span class="metric-trend success">Reproduzindo</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Tablets Parados</span>
            <strong class="metric-value">${offlineCount}</strong>
            <span class="metric-trend ${offlineCount > 0 ? 'danger' : ''}">${offlineCount > 0 ? 'Precisa verificar' : 'Todos OK'}</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Total de Tablets</span>
            <strong class="metric-value">${data.devices.length}</strong>
            <span class="metric-trend">Cadastrados</span>
          </div>
        </article>
      </section>
      <section class="card" style="margin-top: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">Status em Tempo Real</h3>
            <p class="card-subtitle">Veja qual vídeo cada um está passando</p>
          </div>
        </div>
        ${hasData ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tablet</th>
                  <th>Status</th>
                  <th>Vídeo Atual</th>
                  <th>Último Contato</th>
                  <th>Bateria</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state">
            <h3>Nenhum tablet cadastrado</h3>
            <p>Cadastre tablets na aba Tablets.</p>
          </div>
        `}
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function mapView(data) {
  const devicesWithLocation = data.devices.filter(hasDeviceLocation);
  const mapFilters = data.mapFilters || {};
  const selectedDevice = data.devices.find((device) => device.id === mapFilters.deviceId);
  const selectedLabel = mapFilters.deviceId === 'all'
    ? 'Todos os carros'
    : (selectedDevice?.driver || 'Motorista nao informado');
  
  return layoutView(
    'Mapa',
    'Visualize a localização atual dos carros.',
    `
      <section class="card" style="margin-bottom: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">Localização dos Carros</h3>
            <p class="card-subtitle">Selecione um tablet para ver a posição atual enviada pelo banco de dados.</p>
          </div>
          <div class="filter-controls">
            <input id="map-date-filter" class="input" type="date" value="${escapeAttr(mapFilters.date || '')}" />
            <select id="map-device-filter" class="select">
              <option value="all" ${mapFilters.deviceId === 'all' ? 'selected' : ''}>Todos os carros</option>
              ${data.devices.length > 0 ? data.devices.map((device) => `
                <option value="${escapeAttr(device.id)}" ${mapFilters.deviceId === device.id ? 'selected' : ''}>
                  ${escapeHtml(device.name || device.id)}${device.car ? ` - ${escapeHtml(device.car)}` : ''}
                </option>
              `).join('') : '<option value="">Nenhum tablet</option>'}
            </select>
          </div>
        </div>
        <div class="map-route-summary">
          <span><strong id="map-selected-device">${escapeHtml(selectedLabel)}</strong></span>
          <span id="map-selected-detail">${escapeHtml(mapFilters.deviceId === 'all' ? `${data.devices.length} carros cadastrados` : (selectedDevice?.car || 'Veiculo nao informado'))}</span>
          <span id="map-route-count">${mapFilters.deviceId === 'all' ? `${devicesWithLocation.length} com GPS` : ''}</span>
        </div>
      </section>
      <section class="card" style="padding: 0; overflow: hidden;">
        <div id="map" style="height: 500px; width: 100%;"></div>
      </section>
      <section class="grid-3" style="margin-top: 20px;">
        <article class="card">
          <div class="metric">
            <span class="metric-label">Total no Mapa</span>
            <strong class="metric-value">${devicesWithLocation.length}</strong>
            <span class="metric-trend">Dispositivos com GPS</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Online</span>
            <strong class="metric-value">${devicesWithLocation.filter(d => d.status === 'online').length}</strong>
            <span class="metric-trend success">Transmitindo localização</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Offline</span>
            <strong class="metric-value">${devicesWithLocation.filter(d => d.status === 'offline').length}</strong>
            <span class="metric-trend">Ultima posicao salva</span>
          </div>
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function settingsView(data, isDemo) {
  const { metrics, devices, videos, playlists } = data || {};
  
  const handleExport = () => {
    exportToExcel({ metrics, devices, videos, playlists }, 'relatorio-sponsorgo');
  };

  return layoutView(
    'Configurações',
    'Configure e personalize o sistema.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Status do Sistema</h3>
              <p class="card-subtitle">Informações da conexão</p>
            </div>
          </div>
          <div class="list">
            <div class="list-item">
              <div>
                <p class="list-item-title">Modo Atual</p>
                <p class="list-item-subtitle">${isDemo ? 'Demonstração' : 'Produção'}</p>
              </div>
              <span class="pill ${isDemo ? '' : 'active'}">${isDemo ? 'Demo' : 'Ativo'}</span>
            </div>
            <div class="list-item">
              <div>
                <p class="list-item-title">Firebase</p>
                <p class="list-item-subtitle">${isDemo ? 'Não configurado' : 'Conectado'}</p>
              </div>
              <span class="pill ${isDemo ? '' : 'active'}">${isDemo ? 'Pendente' : 'OK'}</span>
            </div>
          </div>
          ${isDemo ? '<div class="notice info">Configure o Firebase no arquivo config.js para usar dados reais.</div>' : ''}
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Exportar Relatório</h3>
              <p class="card-subtitle">Baixe todos os dados em planilha Excel</p>
            </div>
          </div>
          <button class="button primary" id="export-excel-btn" style="margin-top: 16px;">
            Baixar Relatório Excel
          </button>
          <p class="text-muted" style="margin-top: 12px; font-size: 13px;">
            O relatório inclui: Tablets, Vídeos, Playlists e Resumo geral.
          </p>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Sobre</h3>
              <p class="card-subtitle">Informações do sistema</p>
            </div>
          </div>
          <div class="list">
            <div class="list-item">
              <div>
                <p class="list-item-title">SponsorGo Central</p>
                <p class="list-item-subtitle">Sistema de gestão de mídia para tablets</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function hoursView(data) {
  const { devices, hoursData, allHoursData = hoursData, alerts, hoursFilters = {} } = data;
  const today = getLocalDateString();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = String(new Date().getDate()).padStart(2, '0');
  
  const formatHours = (seconds) => {
    const totalMinutes = Math.floor((seconds || 0) / 60);
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };
  
  const formatPercentage = (driving, propaganda) => {
    if (!driving || driving === 0) return '0';
    return (((propaganda || 0) / driving) * 100).toFixed(1);
  };

  const totalDrivingHours = hoursData.reduce((acc, h) => acc + (h.drivingSeconds || 0), 0);
  const totalPropagandaHours = hoursData.reduce((acc, h) => acc + (h.propagandaSeconds || 0), 0);
  
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const devicesBelowGoal = alerts?.length || 0;
  const deviceOptions = [
    ...devices.map(device => ({
      id: device.id,
      label: device.name || device.id,
    })),
    ...allHoursData
      .filter(record => record.deviceId && !devices.some(device => device.id === record.deviceId))
      .map(record => ({
        id: record.deviceId,
        label: record.deviceId,
      })),
  ].filter((device, index, list) => device.id && list.findIndex(item => item.id === device.id) === index);

  const hourRows = hoursData.map((record) => {
    const device = devices.find(d => d.id === record.deviceId);
    const driving = record.drivingSeconds || 0;
    const propaganda = record.propagandaSeconds || 0;
    const percentage = formatPercentage(driving, propaganda);
    const isGoalMet = (driving / 3600) >= DAILY_GOAL_HOURS;
    
    return `
    <tr>
      <td>${escapeHtml(record.date || '—')}</td>
      <td><strong>${escapeHtml(device?.name || record.deviceId || '—')}</strong></td>
      <td>${escapeHtml(device?.car || '—')}</td>
      <td>${escapeHtml(device?.driver || '—')}</td>
      <td class="hours-cell">${formatHours(driving)}</td>
      <td class="hours-cell">${formatHours(propaganda)}</td>
      <td class="percentage-cell">${percentage}%</td>
      <td><span class="status ${isGoalMet ? 'online' : 'offline'}">${isGoalMet ? 'Meta atingida' : 'Abaixo da meta'}</span></td>
    </tr>
  `}).join('');

  const alertRows = alerts?.map((alert) => `
    <div class="alert-item ${safeCssClass(alert.severity || 'warning', 'warning')} ${alert.dismissed ? 'dismissed' : ''}">
      <div class="alert-content">
        <span class="alert-icon">${alert.severity === 'danger' ? '!' : 'i'}</span>
        <div class="alert-text">
          <strong>${escapeHtml(alert.title || 'Alerta')}</strong>
          <span>${escapeHtml(alert.message || 'Verifique este item.')}</span>
          <span class="alert-detail">${escapeHtml(alert.detail || '')}</span>
        </div>
      </div>
      ${alert.type === 'hours' ? `<button class="button small" data-dismiss-alert="${escapeAttr(alert.id)}">Dispensar</button>` : '<span class="pill">Operacional</span>'}
    </div>
  `).join('') || '<p class="text-muted">Nenhum alerta pendente</p>';

  return layoutView(
    'Relatório de Horas',
    'Acompanhe as horas de rodagem e propaganda dos veículos.',
    `
      <section class="grid-4">
        <article class="card">
          <div class="metric">
            <span class="metric-label">Total Rodado</span>
            <strong class="metric-value">${formatHours(totalDrivingHours)}</strong>
            <span class="metric-trend success">Todas as campanhas</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Total Propaganda</span>
            <strong class="metric-value">${formatHours(totalPropagandaHours)}</strong>
            <span class="metric-trend success">${formatPercentage(totalDrivingHours, totalPropagandaHours)}% do tempo</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Tablets Online</span>
            <strong class="metric-value">${onlineDevices}</strong>
            <span class="metric-trend">${devices.length} cadastrados</span>
          </div>
        </article>
        <article class="card">
          <div class="metric">
            <span class="metric-label">Abaixo da Meta</span>
            <strong class="metric-value">${devicesBelowGoal}</strong>
            <span class="metric-trend ${devicesBelowGoal > 0 ? 'danger' : ''}">Meta: ${DAILY_GOAL_HOURS}h/dia</span>
          </div>
        </article>
      </section>

      <section class="card" style="margin-top: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">Alertas do Dia</h3>
            <p class="card-subtitle">Motoristas que não atingiram a meta de ${DAILY_GOAL_HOURS} horas</p>
          </div>
        </div>
        <div class="alerts-list">
          ${alertRows}
        </div>
      </section>

      <section class="card" style="margin-top: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">Registros de Horas</h3>
            <p class="card-subtitle">Horas rodadas x propaganda exibida</p>
          </div>
          <div class="filter-controls">
            <select id="filter-period" class="select">
              <option value="today" ${hoursFilters.period === 'today' ? 'selected' : ''}>Hoje</option>
              <option value="week" ${hoursFilters.period === 'week' ? 'selected' : ''}>Última semana</option>
              <option value="month" ${hoursFilters.period === 'month' ? 'selected' : ''}>Este mês</option>
              <option value="custom" ${hoursFilters.period === 'custom' ? 'selected' : ''}>Personalizado</option>
            </select>
            <input type="date" id="filter-date-start" class="input" value="${escapeAttr(hoursFilters.startDate || today)}" />
            <input type="date" id="filter-date-end" class="input" value="${escapeAttr(hoursFilters.endDate || today)}" />
            <select id="filter-device" class="select">
              <option value="">Todos os tablets</option>
              ${deviceOptions.map(d => `<option value="${escapeAttr(d.id)}" ${hoursFilters.deviceId === d.id ? 'selected' : ''}>${escapeHtml(d.label)}</option>`).join('')}
            </select>
            <button class="button primary" id="export-hours-btn">Exportar Excel</button>
          </div>
        </div>
        ${hourRows ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tablet</th>
                  <th>Veículo</th>
                  <th>Motorista</th>
                  <th>Horas Rodagem</th>
                  <th>Horas Propaganda</th>
                  <th>% Propaganda</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${hourRows}</tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state">
            <h3>Nenhum registro de horas</h3>
            <p>Os dados aparecerão aqui quando os tablets começarem a rastrear horas.</p>
          </div>
        `}
      </section>

      <section class="card" style="margin-top: 20px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">Resumo Mensal</h3>
            <p class="card-subtitle">Estatísticas do mês atual</p>
          </div>
        </div>
        <div class="month-summary">
          <div class="summary-item">
            <span class="summary-label">Mês:</span>
            <span class="summary-value">${currentMonth}/${currentYear}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Dias com dados:</span>
            <span class="summary-value">${new Set(hoursData.map(h => h.date)).size}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Média diária rodagem:</span>
            <span class="summary-value">${hoursData.length > 0 ? formatHours(totalDrivingHours / new Set(hoursData.map(h => h.date)).size) : '0 min'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Eficiência propaganda:</span>
            <span class="summary-value">${formatPercentage(totalDrivingHours, totalPropagandaHours)}%</span>
          </div>
        </div>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function campaignReportsView(data) {
  const {
    campaignMetrics = [],
    playbackProofs = [],
    campaignFilters = {},
    playlists = [],
  } = data;

  const formatDuration = (seconds) => {
    const totalSeconds = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
    if (minutes > 0) return `${minutes}min`;
    return `${totalSeconds}s`;
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  const selectedPlaylistId = campaignFilters.playlistId || '';
  const filteredMetrics = selectedPlaylistId
    ? campaignMetrics.filter((item) => item.playlistId === selectedPlaylistId)
    : campaignMetrics;
  const filteredProofs = selectedPlaylistId
    ? playbackProofs.filter((item) => item.playlistId === selectedPlaylistId)
    : playbackProofs;

  const allVideos = filteredMetrics.flatMap((campaign) =>
    (campaign.videos || []).map((video) => ({
      ...video,
      playlistId: campaign.playlistId,
      playlistName: campaign.playlistName,
      date: campaign.date,
    }))
  );

  const totalSeconds = allVideos.reduce((sum, video) => sum + Number(video.totalPlaybackSeconds || 0), 0);
  const totalLoops = allVideos.reduce((sum, video) => sum + Number(video.loops || 0), 0);
  const uniqueDevices = new Set(allVideos.flatMap((video) => Array.isArray(video.devices) ? video.devices : []));
  const uniqueCampaigns = new Set(filteredMetrics.map((item) => item.playlistId).filter(Boolean));
  const maxVideoSeconds = Math.max(1, ...allVideos.map((video) => Number(video.totalPlaybackSeconds || 0)));

  const byHour = allVideos
    .flatMap((video) => (video.hours || []).map((hour) => ({
      hour: hour.hour || '—',
      seconds: Number(hour.totalPlaybackSeconds || 0),
      loops: Number(hour.loops || 0),
    })))
    .reduce((acc, item) => {
      if (!acc[item.hour]) acc[item.hour] = { hour: item.hour, seconds: 0, loops: 0 };
      acc[item.hour].seconds += item.seconds;
      acc[item.hour].loops += item.loops;
      return acc;
    }, {});

  const hourRanking = Object.values(byHour)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  const maxHourSeconds = Math.max(1, ...hourRanking.map((item) => item.seconds));

  const byCity = allVideos
    .flatMap((video) => (video.cities || []).map((city) => ({
      label: [city.city, city.state].filter(Boolean).join(' - ') || 'Cidade nao informada',
      seconds: Number(city.totalPlaybackSeconds || 0),
      loops: Number(city.loops || 0),
    })))
    .reduce((acc, item) => {
      if (!acc[item.label]) acc[item.label] = { label: item.label, seconds: 0, loops: 0 };
      acc[item.label].seconds += item.seconds;
      acc[item.label].loops += item.loops;
      return acc;
    }, {});

  const cityRanking = Object.values(byCity)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  const maxCitySeconds = Math.max(1, ...cityRanking.map((item) => item.seconds));

  const byNeighborhood = allVideos
    .flatMap((video) => (video.neighborhoods || []).map((item) => ({
      label: item.neighborhood || 'Bairro nao informado',
      city: item.city || '',
      seconds: Number(item.totalPlaybackSeconds || 0),
      loops: Number(item.loops || 0),
    })))
    .reduce((acc, item) => {
      const key = `${item.label}_${item.city}`;
      if (!acc[key]) acc[key] = { ...item, seconds: 0, loops: 0 };
      acc[key].seconds += item.seconds;
      acc[key].loops += item.loops;
      return acc;
    }, {});

  const neighborhoodRanking = Object.values(byNeighborhood)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  const maxNeighborhoodSeconds = Math.max(1, ...neighborhoodRanking.map((item) => item.seconds));

  const videoRows = allVideos
    .slice()
    .sort((a, b) => Number(b.totalPlaybackSeconds || 0) - Number(a.totalPlaybackSeconds || 0))
    .map((video) => {
      const seconds = Number(video.totalPlaybackSeconds || 0);
      const width = Math.max(4, Math.round((seconds / maxVideoSeconds) * 100));
      return `
        <tr>
          <td><strong>${escapeHtml(video.videoName || video.videoId || '—')}</strong><div class="card-subtitle">${escapeHtml(video.playlistName || video.playlistId || '—')}</div></td>
          <td>${escapeHtml(video.date || '—')}</td>
          <td class="hours-cell">${formatDuration(seconds)}</td>
          <td>${Number(video.loops || 0)}</td>
          <td>${Array.isArray(video.devices) ? video.devices.length : 0}</td>
          <td><div class="report-bar"><span style="width:${width}%"></span></div></td>
        </tr>
      `;
    }).join('');

  const rankingRows = (items, maxSeconds, labelTitle) => items.map((item, index) => {
    const width = Math.max(4, Math.round((Number(item.seconds || 0) / maxSeconds) * 100));
    return `
      <div class="ranking-row">
        <span class="ranking-position">${index + 1}</span>
        <div class="ranking-main">
          <strong>${escapeHtml(item.label || item.hour || '—')}</strong>
          <span>${labelTitle === 'hour' ? `${escapeHtml(item.hour)}h` : escapeHtml(item.city || '')}</span>
          <div class="report-bar"><span style="width:${width}%"></span></div>
        </div>
        <div class="ranking-value">
          <strong>${formatDuration(item.seconds)}</strong>
          <span>${Number(item.loops || 0)} loops</span>
        </div>
      </div>
    `;
  }).join('');

  const proofRows = filteredProofs.slice(0, 80).map((proof) => `
    <tr>
      <td><strong>${escapeHtml(proof.videoName || proof.videoId || '—')}</strong><div class="card-subtitle">${escapeHtml(proof.playlistName || proof.playlistId || '—')}</div></td>
      <td>${escapeHtml(proof.deviceId || '—')}<div class="card-subtitle">${escapeHtml(proof.driver || 'Motorista nao informado')}</div></td>
      <td>${formatDateTime(proof.startedAt)}</td>
      <td>${formatDateTime(proof.endedAt)}</td>
      <td class="hours-cell">${formatDuration(proof.durationSeconds)}</td>
      <td>${escapeHtml(proof.endLocation?.city || '—')}<div class="card-subtitle">${escapeHtml(proof.endLocation?.neighborhood || '')}</div></td>
      <td><span class="pill">${escapeHtml(proof.endReason || '—')}</span></td>
    </tr>
  `).join('');

  const playlistOptions = playlists.map((playlist) => `
    <option value="${escapeAttr(playlist.id)}" ${selectedPlaylistId === playlist.id ? 'selected' : ''}>${escapeHtml(playlist.name || playlist.id)}</option>
  `).join('');

  return layoutView(
    'Relatórios de Campanha',
    'Analise tempo exibido, loops, horários, regiões e comprovantes por vídeo.',
    `
      <section class="card report-toolbar">
        <div class="filter-controls">
          <select id="campaign-period" class="select">
            <option value="today" ${campaignFilters.period === 'today' ? 'selected' : ''}>Hoje</option>
            <option value="week" ${campaignFilters.period === 'week' ? 'selected' : ''}>Ultima semana</option>
            <option value="month" ${campaignFilters.period === 'month' ? 'selected' : ''}>Este mes</option>
            <option value="custom" ${campaignFilters.period === 'custom' ? 'selected' : ''}>Personalizado</option>
          </select>
          <input type="date" id="campaign-date-start" class="input campaign-custom-date" value="${escapeAttr(campaignFilters.startDate || getLocalDateString())}" />
          <input type="date" id="campaign-date-end" class="input campaign-custom-date" value="${escapeAttr(campaignFilters.endDate || getLocalDateString())}" />
          <select id="campaign-playlist" class="select">
            <option value="">Todas as campanhas</option>
            ${playlistOptions}
          </select>
          <button class="button primary" id="campaign-apply">Atualizar</button>
          <button class="button secondary" id="campaign-export">Exportar Excel</button>
        </div>
      </section>

      <section class="grid-4" style="margin-top: 16px;">
        <article class="card"><div class="metric"><span class="metric-label">Tempo Exibido</span><strong class="metric-value">${formatDuration(totalSeconds)}</strong><span class="metric-trend success">Periodo selecionado</span></div></article>
        <article class="card"><div class="metric"><span class="metric-label">Loops</span><strong class="metric-value">${totalLoops}</strong><span class="metric-trend">Exibicoes finalizadas</span></div></article>
        <article class="card"><div class="metric"><span class="metric-label">Tablets</span><strong class="metric-value">${uniqueDevices.size}</strong><span class="metric-trend">Com comprovacao</span></div></article>
        <article class="card"><div class="metric"><span class="metric-label">Campanhas</span><strong class="metric-value">${uniqueCampaigns.size}</strong><span class="metric-trend">Com exibicao</span></div></article>
      </section>

      <section class="grid-3" style="margin-top: 16px;">
        <article class="card">
          <div class="card-header"><div><h3 class="card-title">Melhores Horarios</h3><p class="card-subtitle">Tempo exibido por hora</p></div></div>
          <div class="ranking-list">${hourRanking.length ? rankingRows(hourRanking, maxHourSeconds, 'hour') : '<p class="text-muted">Sem dados por horario</p>'}</div>
        </article>
        <article class="card">
          <div class="card-header"><div><h3 class="card-title">Cidades</h3><p class="card-subtitle">Onde a campanha rodou</p></div></div>
          <div class="ranking-list">${cityRanking.length ? rankingRows(cityRanking, maxCitySeconds, 'city') : '<p class="text-muted">Sem dados por cidade</p>'}</div>
        </article>
        <article class="card">
          <div class="card-header"><div><h3 class="card-title">Bairros</h3><p class="card-subtitle">Regioes com mais exibicao</p></div></div>
          <div class="ranking-list">${neighborhoodRanking.length ? rankingRows(neighborhoodRanking, maxNeighborhoodSeconds, 'neighborhood') : '<p class="text-muted">Sem dados por bairro</p>'}</div>
        </article>
      </section>

      <section class="card" style="margin-top: 16px;">
        <div class="card-header"><div><h3 class="card-title">Desempenho por Video</h3><p class="card-subtitle">Tempo exibido, loops e tablets alcancados</p></div></div>
        ${videoRows ? `<div class="table-wrap"><table><thead><tr><th>Video</th><th>Data</th><th>Tempo</th><th>Loops</th><th>Tablets</th><th>Participacao</th></tr></thead><tbody>${videoRows}</tbody></table></div>` : '<div class="empty-state"><h3>Nenhuma metrica encontrada</h3><p>Os dados aparecem quando os tablets finalizarem exibicoes.</p></div>'}
      </section>

      <section class="card" style="margin-top: 16px;">
        <div class="card-header"><div><h3 class="card-title">Comprovantes de Reproducao</h3><p class="card-subtitle">Ultimos 80 registros individuais do periodo</p></div></div>
        ${proofRows ? `<div class="table-wrap"><table><thead><tr><th>Video</th><th>Tablet</th><th>Inicio</th><th>Fim</th><th>Duracao</th><th>Local</th><th>Fim</th></tr></thead><tbody>${proofRows}</tbody></table></div>` : '<div class="empty-state"><h3>Nenhum comprovante encontrado</h3><p>Os comprovantes sao gerados ao final de cada video exibido.</p></div>'}
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function connectionsView(data) {
  const pendingRequests = data.connectionRequests || [];
  const devices = data.devices || [];
  const connectionError = data.connectionError || '';

  const deviceRows = pendingRequests.map((request) => {
    const existingDevice = devices.find(d => d.id === request.deviceId);
    const modelLabel = request.model || request.deviceName || 'Modelo nao informado';
    return `
      <div class="connection-card">
        <div class="connection-device-icon">▣</div>
        <div class="connection-copy">
          <span class="eyebrow">Novo dispositivo</span>
          <h4>${escapeHtml(request.deviceId)}</h4>
          <p>${escapeHtml(modelLabel)} · solicitado ${formatDate(request.createdAt)}</p>
          ${request.ownerUid ? '<span class="security-badge">Identidade verificada</span>' : '<span class="security-badge warning">App antigo · atualize antes de conectar</span>'}
        </div>
        <button class="button primary" data-connect="${escapeAttr(request.deviceId)}" ${existingDevice && existingDevice.name || !request.ownerUid ? 'disabled' : ''}>
          ${existingDevice && existingDevice.name ? 'Já conectado' : 'Conectar'}
        </button>
      </div>
    `;
  }).join('');

  const connectedDevices = devices.filter(d => d.name);

  const connectedRows = connectedDevices.map(device => `
    <div class="list-item" data-device-id="${escapeAttr(device.id)}">
      <div>
        <p class="list-item-title">${escapeHtml(device.name || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(device.id)} • ${escapeHtml(device.model || device.deviceName || 'Modelo nao informado')} • ${escapeHtml(device.car || 'Sem veículo')} • ${escapeHtml(device.driver || 'Sem motorista')}</p>
      </div>
      <div class="row wrap">
        <span class="security-badge ${device.ownerUid ? '' : 'warning'}">${device.ownerUid ? 'Protegido' : 'Identidade pendente'}</span>
        <span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span>
      </div>
    </div>
  `).join('');

  return layoutView(
    'Conexões',
    'Aprove novos tablets e acompanhe a identidade de cada dispositivo.',
    `
      ${connectionError ? `<div class="alert error"><strong>Falha ao consultar conexões.</strong> ${escapeHtml(connectionError)}</div>` : ''}
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <span class="eyebrow">Entrada segura</span>
              <h3 class="card-title">Aguardando aprovação</h3>
              <p class="card-subtitle">Confira o código exibido no tablet antes de conectar.</p>
            </div>
          </div>
          ${pendingRequests.length > 0 ? deviceRows : '<div class="empty-state compact"><span class="empty-icon">✓</span><h3>Tudo em dia</h3><p>Nenhum tablet aguardando aprovação.</p></div>'}
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <span class="eyebrow">Frota</span>
              <h3 class="card-title">Tablets conectados</h3>
              <p class="card-subtitle">Dispositivos aprovados nesta central.</p>
            </div>
          </div>
          ${connectedDevices.length > 0 ? connectedRows : '<p class="text-muted">Nenhum tablet conectado</p>'}
        </article>
      </section>
    `,
    ''
  );
}

export function downloadAppView(data) {
  const appDownloadLink = 'https://drive.google.com/file/d/1onCs_Qpkkwca5sz_ymxuz6udd1H7TagJ/view?usp=sharing';
  
  return layoutView(
    'Baixar App',
    'Baixe o aplicativo SponsorGo para seu celular.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Aplicativo Mobile SponsorGo</h3>
              <p class="card-subtitle">App para gerenciar campanhas no seu celular</p>
            </div>
          </div>
          <div class="list">
            <div class="list-item">
              <div>
                <p class="list-item-title">SponsorGo Mobile</p>
                <p class="list-item-subtitle">Acesso completo ao sistema de campanhas, tablets e vídeos</p>
              </div>
              <a href="${escapeAttr(appDownloadLink)}" class="button primary" target="_blank" rel="noopener" download="sponsorgo.apk">
                ⬇ Baixar APK
              </a>
            </div>
          </div>
          <div class="notice info" style="margin-top: 16px;">
            <strong>Dica:</strong> Instale o aplicativo em seu celular para gerenciar a campanha em qualquer lugar.
          </div>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Recursos do App</h3>
              <p class="card-subtitle">O que você pode fazer</p>
            </div>
          </div>
          <div class="list">
            <div class="list-item" style="border-bottom: 1px solid #333;">
              <div>
                <p class="list-item-title">📊 Monitoramento</p>
                <p class="list-item-subtitle">Acompanhe o status dos tablets em tempo real</p>
              </div>
            </div>
            <div class="list-item" style="border-bottom: 1px solid #333;">
              <div>
                <p class="list-item-title">🎥 Gerenciar Vídeos</p>
                <p class="list-item-subtitle">Envie e organize vídeos para as campanhas</p>
              </div>
            </div>
            <div class="list-item" style="border-bottom: 1px solid #333;">
              <div>
                <p class="list-item-title">📋 Playlists</p>
                <p class="list-item-subtitle">Crie e distribua playlists para os tablets</p>
              </div>
            </div>
            <div class="list-item">
              <div>
                <p class="list-item-title">⏱ Relatórios</p>
                <p class="list-item-subtitle">Visualize horas de rodagem e propaganda</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function appUpdatesView(data) {
  const update = data.appUpdate || {};
  const publishedAt = update.updatedAt || update.publishedAt;

  return layoutView(
    'Atualizações do Player',
    'Publique novas versões do APK para os tablets detectarem automaticamente.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Publicar APK</h3>
              <p class="card-subtitle">O arquivo será enviado ao Appwrite e anunciado no Firebase.</p>
            </div>
          </div>
          <form id="app-update-form" class="list">
            <div class="form-row">
              <div class="form-group">
                <label>Package do app</label>
                <input class="input" name="packageName" value="${escapeAttr(update.packageName || 'com.company.sponsorgodev')}" required />
              </div>
              <div class="form-group">
                <label>Version code</label>
                <input class="input" name="versionCode" type="number" min="1" step="1" value="${escapeAttr(update.versionCode ? Number(update.versionCode) + 1 : 3)}" required />
              </div>
              <div class="form-group">
                <label>Version name</label>
                <input class="input" name="versionName" value="${escapeAttr(update.versionName || '2.0.1-dev')}" required />
              </div>
            </div>
            <div class="form-group">
              <label>Mensagem no tablet</label>
              <input class="input" name="message" value="${escapeAttr(update.message || 'Instale a nova versão do SponsorGo Player.')}" required />
            </div>
            <div class="form-row">
              <label class="checkbox-card">
                <input type="checkbox" name="required" ${update.required !== false ? 'checked' : ''} />
                <span>Obrigatória</span>
              </label>
              <label class="checkbox-card">
                <input type="checkbox" name="active" ${update.active !== false ? 'checked' : ''} />
                <span>Ativa</span>
              </label>
            </div>
            <div class="form-group">
              <label>APK</label>
              <div class="file-upload">
                <input class="file-input" name="apk" type="file" accept=".apk,application/vnd.android.package-archive" id="app-update-apk" required />
                <label for="app-update-apk" class="file-label"><span class="file-icon">▣</span><span class="file-text" id="app-update-file-name">Clique para selecionar o APK</span></label>
              </div>
            </div>
            <div class="upload-progress" id="app-update-progress" hidden>
              <div class="upload-progress-header">
                <span id="app-update-progress-text">Aguardando APK...</span>
                <strong id="app-update-progress-percent">0%</strong>
              </div>
              <div class="upload-progress-track"><span id="app-update-progress-bar"></span></div>
            </div>
            <button class="button primary" type="submit">Publicar atualização</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Última atualização publicada</h3>
              <p class="card-subtitle">Documento appUpdates/latest</p>
            </div>
          </div>
          ${update.versionCode ? `
            <div class="list">
              <div class="list-item"><div><p class="list-item-title">Versão ${escapeHtml(update.versionName || update.versionCode)}</p><p class="list-item-subtitle">Version code ${escapeHtml(update.versionCode)} • ${escapeHtml(update.packageName || 'package não informado')}</p></div><span class="pill ${update.active === false ? '' : 'active'}">${update.active === false ? 'Inativa' : 'Ativa'}</span></div>
              <div class="list-item"><div><p class="list-item-title">${escapeHtml(update.fileName || 'APK')}</p><p class="list-item-subtitle">${escapeHtml(update.fileId || 'Sem fileId')} • ${update.sizeBytes ? `${Math.round(Number(update.sizeBytes) / (1024 * 1024))} MB` : 'Tamanho não informado'}</p></div></div>
              <div class="list-item"><div><p class="list-item-title">${update.required === false ? 'Opcional' : 'Obrigatória'}</p><p class="list-item-subtitle">${escapeHtml(update.message || 'Sem mensagem')}</p></div></div>
              <div class="list-item"><div><p class="list-item-title">Publicada</p><p class="list-item-subtitle">${formatDate(publishedAt)}</p></div></div>
            </div>
          ` : `
            <div class="empty-state">
              <h3>Nenhuma atualização publicada</h3>
              <p>Envie um APK para criar o documento appUpdates/latest.</p>
            </div>
          `}
          <div class="notice info" style="margin-top: 16px;">
            <strong>Atenção:</strong> o versionCode informado aqui precisa ser exatamente o versionCode compilado dentro do APK. Se publicar 3, o build.gradle do Android também precisa estar com versionCode 3.
          </div>
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}



