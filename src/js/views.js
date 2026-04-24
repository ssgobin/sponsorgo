import { layoutView } from './templates.js';
import { exportToExcel } from './export-excel.js';

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
    <tr>
      <td><strong>${device.name || '—'}</strong><div class="card-subtitle">${device.id || '—'}</div></td>
      <td>${device.car || '—'}</td>
      <td><span class="status ${device.status || 'offline'}">${formatDeviceStatus(device.status)}</span></td>
      <td>${getVideoTitle(device.currentVideoId) || device.currentVideo || '—'}</td>
      <td>${formatDate(lastContact) || '—'}</td>
      <td>${device.battery >= 0 ? `${device.battery}%` : '—'}</td>
      <td style="width:80px;">
        <button class="button-edit" data-edit="tablet" data-id="${device.id}" title="Editar">✎</button>
        <button class="button-delete" data-delete="tablet" data-id="${device.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `}).join('');

  const activities = activity.length > 0 ? activity.map((item) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${item.title || '—'}</p>
        <p class="list-item-subtitle">${item.detail || '—'}</p>
      </div>
      <span class="pill">${item.when || '—'}</span>
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
  const items = data.devices.length > 0 ? data.devices.map((device) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${device.name || '—'}</p>
        <p class="list-item-subtitle">${device.id || '—'} • ${device.car || 'Sem veículo'} • ${device.driver || 'Sem motorista'}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="status ${device.status || 'offline'}">${formatDeviceStatus(device.status)}</span>
        ${device.battery ? `<span class="pill">${device.battery}% bateria</span>` : ''}
        <button class="button-edit" data-edit="tablet" data-id="${device.id}" title="Editar">✎</button>
        <button class="button-delete" data-delete="tablet" data-id="${device.id}" title="Excluir">✕</button>
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
          <form id="device-form" class="list">
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
        <p class="list-item-title">${video.title || '—'}</p>
        <p class="list-item-subtitle">${video.fileName || 'arquivo.mp4'} • ${video.duration || '00:00'} • ${video.size || '—'}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="pill ${video.status === 'Ativo' || video.status === 'active' ? 'active' : ''}">${video.status || 'Rascunho'}</span>
        <button class="button-delete" data-delete="vídeo" data-id="${video.id}" data-file-id="${video.fileId || ''}" title="Excluir">✕</button>
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
            <div class="form-row three">
              <div class="form-group">
                <label>Título do Vídeo</label>
                <input class="input" name="title" placeholder="Promo Abril 01" required />
              </div>
              <div class="form-group">
                <label>Duração</label>
                <input class="input" name="duration" placeholder="00:30" required />
              </div>
              <div class="form-group">
                <label>Status</label>
                <select class="select" name="status">
                  <option value="Ativo">Ativo</option>
                  <option value="Rascunho">Rascunho</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Arquivo do Vídeo</label>
              <div class="file-upload">
                <input class="file-input" name="file" type="file" accept="video/*" id="video-file" />
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
  const videoOptions = data.videos.map((video) => `<option value="${video.id || video.title}">${video.title}</option>`).join('');
  const deviceOptions = data.devices.map((device) => `<option value="${device.id || device.name}">${device.name}</option>`).join('');
  
  const items = data.playlists.length > 0 ? data.playlists.map((playlist) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${playlist.name || '—'}</p>
        <p class="list-item-subtitle">${playlist.videos?.length || playlist.videos || 0} vídeos • ${playlist.devices?.length || playlist.devices || 0} tablets • ${formatDate(playlist.updatedAt)}</p>
      </div>
      <div class="row wrap" style="align-items:center;gap:8px;">
        <span class="pill ${playlist.status === 'Ativa' || playlist.status === 'active' ? 'active' : ''}">${playlist.status || 'Inativa'}</span>
        <button class="button-edit" data-edit="playlist" data-id="${playlist.id}" title="Editar">✎</button>
        <button class="button-delete" data-delete="playlist" data-id="${playlist.id}" title="Excluir">✕</button>
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
                    <input type="checkbox" name="videos" value="${video.id || video.title}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${video.title}</span>
                  </label>
                `).join('') : '<p class="text-muted">Nenhum vídeo disponível</p>'}
              </div>
            </div>
            <div class="form-group">
              <label>Selecionar Tablets</label>
              <div class="checkbox-list">
                ${data.devices.length > 0 ? data.devices.map((device) => `
                  <label class="checkbox-item">
                    <input type="checkbox" name="devices" value="${device.id || device.name}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${device.name}</span>
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
    <tr>
      <td><strong>${device.name || '—'}</strong></td>
      <td><span class="status ${device.status || 'offline'}">${formatDeviceStatus(device.status)}</span></td>
      <td>${getVideoTitle(device.currentVideoId) || device.currentVideo || '—'}</td>
      <td>${formatDate(lastContact) || '—'}</td>
      <td>${device.battery >= 0 ? `${device.battery}%` : '—'}</td>
      <td style="width:50px;"><button class="button-edit" data-edit="tablet" data-id="${device.id}" title="Editar">✎</button></td>
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