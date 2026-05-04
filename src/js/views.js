import { layoutView } from './templates.js';
import { displayText, escapeHtml } from './dom.js';

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
    <tr data-device-id="${device.id}">
      <td><strong>${displayText(device.name)}</strong><div class="card-subtitle">${displayText(device.id)}</div></td>
      <td>${displayText(device.car)}</td>
      <td><span class="status ${device.status || 'offline'}">${formatDeviceStatus(device.status)}</span></td>
      <td>${displayText(getVideoTitle(device.currentVideoId) || device.currentVideo)}</td>
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
        <p class="list-item-title">${displayText(item.title)}</p>
        <p class="list-item-subtitle">${displayText(item.detail)}</p>
      </div>
      <span class="pill">${displayText(item.when)}</span>
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
    <div class="list-item" data-device-id="${device.id}">
      <div>
        <p class="list-item-title">${displayText(device.name)}</p>
        <p class="list-item-subtitle">${displayText(device.id)} • ${displayText(device.car, 'Sem veículo')} • ${displayText(device.driver, 'Sem motorista')}</p>
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
        <p class="list-item-title">${displayText(video.title)}</p>
        <p class="list-item-subtitle">${displayText(video.fileName, 'arquivo.mp4')} • ${displayText(video.duration, '00:00')} • ${displayText(video.size)}</p>
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
  const items = data.playlists.length > 0 ? data.playlists.map((playlist) => `
    <div class="list-item">
      <div>
        <p class="list-item-title">${displayText(playlist.name)}</p>
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
                    <input type="checkbox" name="videos" value="${escapeHtml(video.id || video.title)}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${displayText(video.title)}</span>
                  </label>
                `).join('') : '<p class="text-muted">Nenhum vídeo disponível</p>'}
              </div>
            </div>
            <div class="form-group">
              <label>Selecionar Tablets</label>
              <div class="checkbox-list">
                ${data.devices.length > 0 ? data.devices.map((device) => `
                  <label class="checkbox-item">
                    <input type="checkbox" name="devices" value="${escapeHtml(device.id || device.name)}" />
                    <span class="checkbox-box">✓</span>
                    <span class="checkbox-label">${displayText(device.name)}</span>
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

function formatScheduleDate(value) {
  if (!value) return '—';
  const millis = typeof value === 'number' ? value : (value.toDate ? value.toDate().getTime() : Number(value));
  if (!Number.isFinite(millis)) return '—';
  return new Date(millis).toLocaleString('pt-BR');
}

function formatScheduleDays(days = []) {
  if (!Array.isArray(days) || days.length === 0) return 'Todos os dias';
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days.map(day => labels[Number(day)]).filter(Boolean).join(', ') || 'Todos os dias';
}

export function schedulesView(data) {
  const playlists = data.playlists || [];
  const devices = data.devices || [];
  const schedules = data.schedules || [];

  const playlistOptions = playlists.map((playlist) => `
    <option value="${escapeHtml(playlist.id)}">${displayText(playlist.name)}</option>
  `).join('');

  const deviceItems = devices.map((device) => `
    <label class="checkbox-item">
      <input type="checkbox" name="devices" value="${escapeHtml(device.id)}" />
      <span class="checkbox-box">✓</span>
      <span class="checkbox-label">${displayText(device.name || device.id)}</span>
    </label>
  `).join('');

  const dayItems = [
    ['0', 'Dom'], ['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'],
    ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'],
  ].map(([value, label]) => `
    <label class="day-pill">
      <input type="checkbox" name="daysOfWeek" value="${value}" />
      <span>${label}</span>
    </label>
  `).join('');

  const items = schedules.length > 0 ? schedules.map((schedule) => {
    const playlist = playlists.find((item) => item.id === schedule.playlistId);
    const deviceNames = (schedule.deviceIds || [])
      .map((id) => devices.find((device) => device.id === id)?.name || id)
      .join(', ');
    const timeWindow = schedule.startTime && schedule.endTime
      ? ` • ${displayText(schedule.startTime)}-${displayText(schedule.endTime)}`
      : '';

    return `
      <div class="list-item">
        <div>
          <p class="list-item-title">${displayText(schedule.name || playlist?.name || 'Agendamento')}</p>
          <p class="list-item-subtitle">
            ${displayText(playlist?.name || schedule.playlistName || schedule.playlistId)}
            • ${displayText(deviceNames, 'Sem tablets')}
          </p>
          <p class="list-item-subtitle">
            ${formatScheduleDate(schedule.startsAt)} até ${formatScheduleDate(schedule.endsAt)}
            • ${formatScheduleDays(schedule.daysOfWeek)}${timeWindow}
          </p>
        </div>
        <div class="row wrap" style="align-items:center;gap:8px;">
          <span class="pill ${schedule.active !== false ? 'active' : ''}">${schedule.active !== false ? 'Ativo' : 'Inativo'}</span>
          <span class="pill">Prioridade ${Number(schedule.priority || 0)}</span>
          <button class="button-delete" data-delete="agendamento" data-id="${escapeHtml(schedule.id)}" title="Excluir">✕</button>
        </div>
      </div>
    `;
  }).join('') : '';

  return layoutView(
    'Agenda',
    'Defina quando uma playlist deve tocar em cada tablet.',
    `
      <section class="grid-2">
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Novo Agendamento</h3>
              <p class="card-subtitle">A agenda tem prioridade sobre a playlist padrão</p>
            </div>
          </div>
          <form id="schedule-form" class="list">
            <div class="form-row">
              <div class="form-group">
                <label>Nome</label>
                <input class="input" name="name" placeholder="Campanha manhã" />
              </div>
              <div class="form-group">
                <label>Playlist</label>
                <select class="select" name="playlistId" required>
                  <option value="">Selecione</option>
                  ${playlistOptions}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Início</label>
                <input class="input" name="startsAt" type="datetime-local" required />
              </div>
              <div class="form-group">
                <label>Fim</label>
                <input class="input" name="endsAt" type="datetime-local" required />
              </div>
            </div>
            <div class="form-row three">
              <div class="form-group">
                <label>Hora inicial diária</label>
                <input class="input" name="startTime" type="time" />
              </div>
              <div class="form-group">
                <label>Hora final diária</label>
                <input class="input" name="endTime" type="time" />
              </div>
              <div class="form-group">
                <label>Prioridade</label>
                <input class="input" name="priority" type="number" value="0" min="0" max="999" />
              </div>
            </div>
            <div class="form-group">
              <label>Dias da semana</label>
              <div class="checkbox-list schedule-days">${dayItems}</div>
            </div>
            <div class="form-group">
              <label>Tablets</label>
              <div class="checkbox-list">
                ${deviceItems || '<p class="text-muted">Nenhum tablet disponível</p>'}
              </div>
            </div>
            <label class="checkbox-item">
              <input type="checkbox" name="active" checked />
              <span class="checkbox-box">✓</span>
              <span class="checkbox-label">Agendamento ativo</span>
            </label>
            <button class="button primary" type="submit">Salvar Agendamento</button>
          </form>
        </article>
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Agendamentos</h3>
              <p class="card-subtitle">Maior prioridade vence em caso de conflito</p>
            </div>
          </div>
          ${items ? `<div class="list">${items}</div>` : `
            <div class="empty-state">
              <h3>Nenhum agendamento</h3>
              <p>Crie uma janela de reprodução ao lado.</p>
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
    <tr data-device-id="${device.id}">
      <td><strong>${displayText(device.name)}</strong></td>
      <td><span class="status ${device.status || 'offline'}">${formatDeviceStatus(device.status)}</span></td>
      <td>${displayText(getVideoTitle(device.currentVideoId) || device.currentVideo)}</td>
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

export function connectionsView(data) {
  const pendingRequests = data.connectionRequests || [];
  const devices = data.devices || [];

  const deviceRows = pendingRequests.map((request) => {
    const existingDevice = devices.find(d => d.id === request.deviceId);
    return `
      <div class="connection-card">
        <div>
          <h4>${displayText(request.deviceId)}</h4>
          <p>
            Solicitado: ${formatDate(request.createdAt)}
          </p>
        </div>
        <button class="button primary" data-connect="${escapeHtml(request.deviceId)}" ${existingDevice && existingDevice.name ? 'disabled' : ''}>
          ${existingDevice && existingDevice.name ? 'Já conectado' : 'Conectar'}
        </button>
      </div>
    `;
  }).join('');

  const connectedDevices = devices.filter(d => d.name && d.createdAt);

  const connectedRows = connectedDevices.map(device => `
    <div class="list-item" data-device-id="${device.id}">
      <div>
        <p class="list-item-title">${displayText(device.name)}</p>
        <p class="list-item-subtitle">${displayText(device.id)} • ${displayText(device.car, 'Sem veículo')} • ${displayText(device.driver, 'Sem motorista')}</p>
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
              <p class="card-subtitle">Já aprovados</p>
            </div>
          </div>
          ${connectedDevices.length > 0 ? connectedRows : '<p class="text-muted">Nenhum tablet conectado</p>'}
        </article>
      </section>
    `,
    ''
  );
}
