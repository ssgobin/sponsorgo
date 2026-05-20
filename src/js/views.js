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

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      <td>${escapeHtml(getVideoTitle(device.currentVideoId) || device.currentVideo || '—')}</td>
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
  const items = data.devices.length > 0 ? data.devices.map((device) => `
    <div class="list-item" data-device-id="${escapeAttr(device.id)}">
      <div>
        <p class="list-item-title">${escapeHtml(device.name || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(device.id || '—')} • ${escapeHtml(device.car || 'Sem veículo')} • ${escapeHtml(device.driver || 'Sem motorista')}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span>
        ${device.battery ? `<span class="pill">${device.battery}% bateria</span>` : ''}
        <button class="button-edit" data-edit="tablet" data-id="${escapeAttr(device.id)}" title="Editar">✎</button>
        <button class="button-delete" data-delete="tablet" data-id="${escapeAttr(device.id)}" title="Excluir">✕</button>
      </div>
    </div>
  `).join('') : '';

  return layoutView(
    'Tablets',
    'Gerencie os tablets que vão mostrar seus vídeos.',
    `
      <section class="grid-2">
        <article class="card">
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
              <div class="form-group">
                <label>Nome do Tablet</label>
                <input class="input" name="name" placeholder="Tablet Corolla 01" required />
              </div>
              <div class="form-group">
                <label>Identificador</label>
                <input class="input" name="deviceCode" placeholder="TAB-001" required />
              </div>
              <div class="form-group">
                <label>Veículo</label>
                <input class="input" name="car" placeholder="Toyota Corolla" />
              </div>
              <div class="form-group">
                <label>Motorista</label>
                <input class="input" name="driver" placeholder="Carlos" />
              </div>
            </div>
            <button class="button primary" type="submit">Cadastrar Tablet</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Tablets Cadastrados</h3>
              <p class="card-subtitle">Lista de todos os tablets</p>
            </div>
          </div>
          ${items ? `
            <div class="list">${items}</div>
          ` : `
            <div class="empty-state">
              <h3>Nenhum tablet cadastrado</h3>
              <p>Adicione o primeiro tablet ao lado.</p>
            </div>
          `}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function videosView(data) {
  const items = data.videos.length > 0 ? data.videos.map((video) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${escapeHtml(video.title || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(video.fileName || 'arquivo.mp4')} • ${escapeHtml(video.duration || '00:00')} • ${escapeHtml(video.size || '—')}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="pill ${video.status === 'Ativo' || video.status === 'active' ? 'active' : ''}">${escapeHtml(video.status || 'Rascunho')}</span>
        <button class="button-delete" data-delete="vídeo" data-id="${escapeAttr(video.id)}" data-file-id="${escapeAttr(video.fileId || '')}" title="Excluir">✕</button>
      </div>
    </div>
  `).join('') : '';

  return layoutView(
    'Vídeos',
    'Adicione vídeos para mostrar nos tablets.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Enviar Novo Vídeo</h3>
              <p class="card-subtitle">Adicione um vídeo à sua biblioteca</p>
            </div>
          </div>
          <form id="video-form" class="list">
            <div class="form-row">
              <div class="form-group">
                <label>Título do Vídeo</label>
                <input class="input" name="title" placeholder="Promo Abril 01" required />
              </div>
            </div>
            <div class="form-group">
              <label>Arquivo do Vídeo</label>
              <div class="file-upload">
                <input class="file-input" name="file" type="file" accept="video/*" id="video-file" required />
                <label for="video-file" class="file-label">
                  <span class="file-icon">📁</span>
                  <span class="file-text" id="file-name">Clique para selecionar um vídeo</span>
                </label>
              </div>
            </div>
            <button class="button primary" type="submit">Enviar Vídeo</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Biblioteca de Vídeos</h3>
              <p class="card-subtitle">Todos os vídeos disponíveis</p>
            </div>
          </div>
          ${items ? `
            <div class="list">${items}</div>
          ` : `
            <div class="empty-state">
              <h3>Nenhum vídeo enviado</h3>
              <p>Envie o primeiro vídeo aqui.</p>
            </div>
          `}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function playlistsView(data) {
  const items = data.playlists.length > 0 ? data.playlists.map((playlist) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${escapeHtml(playlist.name || '—')}</p>
        <p class="list-item-subtitle">${playlist.videos?.length || playlist.videos || 0} vídeos • ${playlist.devices?.length || playlist.devices || 0} tablets • ${formatDate(playlist.updatedAt)}</p>
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
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Nova Playlist</h3>
              <p class="card-subtitle">Escolha quais vídeos terão e quais tablets receberão</p>
            </div>
          </div>
          <form id="playlist-form" class="list">
            <div class="form-group">
              <label>Nome da Playlist</label>
              <input class="input" name="name" placeholder="Campanha Abril" required />
            </div>
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
                  <label class="checkbox-item">
                    <input type="checkbox" name="devices" value="${escapeAttr(device.id || device.name)}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${escapeHtml(device.name)}</span>
                  </label>
                `).join('') : '<p class="text-muted">Nenhum tablet disponível</p>'}
              </div>
            </div>
            <button class="button primary" type="submit">Criar Playlist</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Playlists Criadas</h3>
              <p class="card-subtitle">Lista de todas as playlists</p>
            </div>
          </div>
          ${items ? `
            <div class="list">${items}</div>
          ` : `
            <div class="empty-state">
              <h3>Nenhuma playlist criada</h3>
              <p>Crie a primeira playlist ao lado.</p>
            </div>
          `}
        </article>
      </section>
    `,
    '<button class="button ghost" data-action="logout">Sair</button>'
  );
}

export function monitorView(data) {
  const getVideoTitle = (videoId) => {
    if (!videoId) return '—';
    const video = data.videos?.find(v => v.id === videoId);
    return video?.title || videoId;
  };

  const rows = data.devices.length > 0 ? data.devices.map((device) => {
    const lastContact = device.lastHeartbeat 
      ? (device.lastHeartbeat.toDate ? device.lastHeartbeat.toDate() : new Date(device.lastHeartbeat))
      : null;
    return `
    <tr data-device-id="${escapeAttr(device.id)}">
      <td><strong>${escapeHtml(device.name || '—')}</strong></td>
      <td><span class="status ${safeCssClass(device.status, 'offline')}">${formatDeviceStatus(device.status)}</span></td>
      <td>${escapeHtml(getVideoTitle(device.currentVideoId) || device.currentVideo || '—')}</td>
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
  const devicesWithLocation = data.devices.filter(d => d.location && d.location.latitude != null && d.location.longitude != null);
  
  return layoutView(
    'Mapa',
    'Visualize a localização dos tablets em tempo real.',
    `
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
            <span class="metric-trend danger">Sem localização</span>
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
    <div class="alert-item ${alert.dismissed ? 'dismissed' : ''}">
      <div class="alert-content">
        <span class="alert-icon">⚠</span>
        <div class="alert-text">
          <strong>${escapeHtml(alert.driver || 'Motorista')}</strong> não rodou ${alert.difference?.toFixed(1) || '0'} horas
          <span class="alert-detail">(Meta: ${DAILY_GOAL_HOURS}h, Rodou: ${alert.drivingHours?.toFixed(1) || '0'}h)</span>
        </div>
      </div>
      <button class="button small" data-dismiss-alert="${escapeAttr(alert.id)}">Dispensar</button>
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

export function connectionsView(data) {
  const pendingRequests = data.connectionRequests || [];
  const devices = data.devices || [];

  const deviceRows = pendingRequests.map((request) => {
    const existingDevice = devices.find(d => d.id === request.deviceId);
    return `
      <div class="connection-card" style="background: #1a1a2e; padding: 16px; margin-bottom: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #333;">
        <div>
          <h4 style="margin: 0 0 8px; color: #00ff00;">${escapeHtml(request.deviceId)}</h4>
          <p style="margin: 0; color: #aaa; font-size: 13px;">
            Solicitado: ${formatDate(request.createdAt)}
          </p>
        </div>
        <button class="button primary" data-connect="${escapeAttr(request.deviceId)}" ${existingDevice && existingDevice.name ? 'disabled' : ''}>
          ${existingDevice && existingDevice.name ? 'Já conectado' : 'Conectar'}
        </button>
      </div>
    `;
  }).join('');

  const connectedDevices = devices.filter(d => d.name && d.createdAt);

  const connectedRows = connectedDevices.map(device => `
    <div class="list-item" data-device-id="${escapeAttr(device.id)}">
      <div>
        <p class="list-item-title">${escapeHtml(device.name || '—')}</p>
        <p class="list-item-subtitle">${escapeHtml(device.id)} • ${escapeHtml(device.car || 'Sem veículo')} • ${escapeHtml(device.driver || 'Sem motorista')}</p>
      </div>
      <span class="pill active">Conectado</span>
    </div>
  `).join('');

  return layoutView(
    'Conexões',
    'Gerencie a conexão dos tablets.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Tablets Pendentes</h3>
              <p class="card-subtitle">Aguardando aprovação</p>
            </div>
          </div>
          ${pendingRequests.length > 0 ? deviceRows : '<p class="text-muted">Nenhum tablet pendente</p>'}
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Tablets Conectados</h3>
              <p class="card-subtitle">Já approvedos</p>
            </div>
          </div>
          ${connectedDevices.length > 0 ? connectedRows : '<p class="text-muted">Nenhum tablet conectado</p>'}
        </article>
      </section>
    `,
    ''
  );
}
