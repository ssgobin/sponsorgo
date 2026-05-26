export function exportToExcel(state, fileName = 'relatorio-sponsorgo') {
  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const sheets = [];

  if (Array.isArray(state.hoursReport)) {
    sheets.push({ name: 'Horas', rows: state.hoursReport });
  } else {
    sheets.push(
      { name: 'Tablets', rows: createDevicesRows(state.devices || []) },
      { name: 'Videos', rows: createVideosRows(state.videos || []) },
      { name: 'Playlists', rows: createPlaylistsRows(state.playlists || [], state.videos || [], state.devices || []) },
      { name: 'Resumo', rows: createSummaryRows(state.metrics || {}) }
    );
  }

  downloadWorkbook(sheets, `${fileName}-${dateStr}.xls`);
}

function createDevicesRows(devices) {
  return devices.map((d, index) => ({
    '#': index + 1,
    'Nome': d.name || '',
    'Identificador': d.id || '',
    'Veiculo': d.car || '',
    'Motorista': d.driver || '',
    'Status': d.status === 'online' ? 'Ativo' : 'Parado',
    'Ultimo Contato': formatDateTime(d.lastHeartbeat),
    'Bateria (%)': d.battery ?? '-',
    'Video Atual': d.currentVideo || d.currentVideoId || '-',
    'Playlist': d.playlistName || d.playlistId || '-',
  }));
}

function createVideosRows(videos) {
  return videos.map((v, index) => ({
    '#': index + 1,
    'Título': v.title || '',
    'Arquivo': v.fileName || '',
    'Duração': v.duration || '',
    'Tamanho': v.size || '',
    'Status': v.status === 'Ativo' || v.status === 'active' ? 'Ativo' : 'Rascunho',
    'Data Upload': formatDateTime(v.createdAt),
  }));
}

function createPlaylistsRows(playlists, videos, devices) {
  return playlists.map((p, index) => {
    const videoNames = Array.isArray(p.videos)
      ? p.videos.map(v => {
        const videoId = typeof v === 'string' ? v : v.id;
        const vid = videos.find(x => x.id === videoId);
        return vid?.title || v.name || videoId;
      }).join(', ')
      : '-';

    const deviceNames = Array.isArray(p.devices)
      ? p.devices.map(d => {
        const deviceId = typeof d === 'string' ? d : d.id;
        const dev = devices.find(x => x.id === deviceId);
        return dev?.name || deviceId;
      }).join(', ')
      : '-';

    return {
      '#': index + 1,
      'Nome': p.name || '',
      'Status': p.status === 'Ativa' || p.status === 'active' ? 'Ativa' : 'Inativa',
      'Videos': videoNames,
      'Tablets': deviceNames,
      'Qtd Videos': Array.isArray(p.videos) ? p.videos.length : 0,
      'Qtd Tablets': Array.isArray(p.devices) ? p.devices.length : 0,
      'Criada em': formatDateTime(p.createdAt),
      'Atualizada em': formatDateTime(p.updatedAt),
    };
  });
}

function createSummaryRows(metrics) {
  const now = new Date().toLocaleString('pt-BR');
  return [
    { 'Metrica': 'Tablets Ativos', 'Valor': metrics.onlineDevices || 0, 'Observacao': 'Tablets online e reproduzindo' },
    { 'Metrica': 'Tablets Parados', 'Valor': metrics.offlineDevices || 0, 'Observacao': 'Tablets offline ou sem contato' },
    { 'Metrica': 'Atualizados Hoje', 'Valor': metrics.syncedToday || 0, 'Observacao': 'Tablets que sincronizaram hoje' },
    { 'Metrica': 'Videos Ativos', 'Valor': metrics.activeVideos || 0, 'Observacao': 'Videos com status ativo' },
    { 'Metrica': '', 'Valor': '', 'Observacao': '' },
    { 'Metrica': 'Relatorio gerado em', 'Valor': now, 'Observacao': 'SponsorGo Central' },
  ];
}

function downloadWorkbook(sheets, filename) {
  const workbookXml = buildWorkbookXml(sheets);
  const blob = new Blob([workbookXml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildWorkbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1a73e8" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${sheets.map(sheetToXml).join('\n')}
</Workbook>`;
}

function sheetToXml(sheet) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : ['Sem dados'];
  return `<Worksheet ss:Name="${xmlAttr(sheet.name)}">
    <Table>
      <Row>${columns.map(col => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlText(col)}</Data></Cell>`).join('')}</Row>
      ${rows.map(row => `<Row>${columns.map(col => cellToXml(row[col])).join('')}</Row>`).join('\n')}
    </Table>
  </Worksheet>`;
}

function cellToXml(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlText(value ?? '')}</Data></Cell>`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  if (timestamp.toDate) return timestamp.toDate().toLocaleString('pt-BR');
  if (typeof timestamp === 'number') return new Date(timestamp).toLocaleString('pt-BR');
  if (typeof timestamp === 'string') return timestamp;
  return '-';
}

function xmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlAttr(value) {
  return xmlText(value).replace(/"/g, '&quot;');
}

