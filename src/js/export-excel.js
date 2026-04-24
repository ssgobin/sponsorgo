import * as XLSX from 'xlsx';

export function exportToExcel(state, fileName = 'relatorio-sponsorgo') {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  
  createDevicesSheet(wb, state.devices);
  createVideosSheet(wb, state.videos);
  createPlaylistsSheet(wb, state.playlists, state.videos, state.devices);
  createSummarySheet(wb, state.metrics);

  XLSX.writeFile(wb, `${fileName}-${dateStr}.xlsx`);
}

function createDevicesSheet(wb, devices) {
  const data = devices.map((d, index) => ({
    '#': index + 1,
    'Nome': d.name || '',
    'Identificador': d.id || '',
    'Veículo': d.car || '',
    'Motorista': d.driver || '',
    'Status': d.status === 'online' ? 'Ativo' : 'Parado',
    'Último Contato': formatDateTime(d.lastHeartbeat),
    'Bateria (%)': d.battery ?? '—',
    'Vídeo Atual': d.currentVideo || d.currentVideoId || '—',
    'Playlist': d.playlistName || d.playlistId || '—',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 5 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 },
    { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 20 }
  ];

  applyHeaderStyle(ws, data.length);
  applyTableBorders(ws, data.length, 10);
  
  XLSX.utils.book_append_sheet(wb, ws, 'Tablets');
}

function createVideosSheet(wb, videos) {
  const data = videos.map((v, index) => ({
    '#': index + 1,
    'Título': v.title || '',
    'Arquivo': v.fileName || '',
    'Duração': v.duration || '',
    'Tamanho': v.size || '',
    'Status': v.status === 'Ativo' || v.status === 'active' ? 'Ativo' : 'Rascunho',
    'Data Upload': formatDateTime(v.createdAt),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 5 }, { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }
  ];

  applyHeaderStyle(ws, data.length);
  applyTableBorders(ws, data.length, 7);
  
  XLSX.utils.book_append_sheet(wb, ws, 'Vídeos');
}

function createPlaylistsSheet(wb, playlists, videos, devices) {
  const data = playlists.map((p, index) => {
    const videoNames = p.videos?.map(v => {
      const vid = videos?.find(x => x.id === v.id);
      return vid?.title || v.name || v.id;
    }).join(', ') || '—';
    
    const deviceNames = p.devices?.map(d => {
      const dev = devices?.find(x => x.id === d);
      return dev?.name || d;
    }).join(', ') || '—';

    return {
      '#': index + 1,
      'Nome': p.name || '',
      'Status': p.status === 'Ativa' || p.status === 'active' ? 'Ativa' : 'Inativa',
      'Vídeos': videoNames,
      'Tablets': deviceNames,
      'Qtd Vídeos': p.videos?.length || 0,
      'Qtd Tablets': p.devices?.length || 0,
      'Criada em': formatDateTime(p.createdAt),
      'Atualizada em': formatDateTime(p.updatedAt),
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 5 }, { wch: 25 }, { wch: 10 }, { wch: 40 }, { wch: 40 },
    { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }
  ];

  applyHeaderStyle(ws, data.length);
  applyTableBorders(ws, data.length, 8);
  
  XLSX.utils.book_append_sheet(wb, ws, 'Playlists');
}

function createSummarySheet(wb, metrics) {
  const now = new Date().toLocaleString('pt-BR');
  
  const data = [
    { 'Métrica': 'Tablets Ativos', 'Valor': metrics.onlineDevices || 0, 'Observação': 'Tablets online e reproduzindo' },
    { 'Métrica': 'Tablets Parados', 'Valor': metrics.offlineDevices || 0, 'Observação': 'Tablets offline ou sem contato' },
    { 'Métrica': 'Atualizados Hoje', 'Valor': metrics.syncedToday || 0, 'Observação': 'Tablets que sincronizaram hoje' },
    { 'Métrica': 'Vídeos Ativos', 'Valor': metrics.activeVideos || 0, 'Observação': 'Vídeos com status ativo' },
    { 'Métrica': '', 'Valor': '', 'Observação': '' },
    { 'Métrica': 'Relatório-gerado em', 'Valor': now, 'Observação': 'SponsorGo Central' },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 35 }
  ];

  applyHeaderStyle(ws, data.length);
  applyTableBorders(ws, data.length, 3);
  
  const headerRow = ws['A1'];
  headerRow.s = { fill: { fgColor: { rgb: '1a73e8' } }, font: { color: { rgb: 'ffffff' }, bold: true } };
  
  XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  if (timestamp.toDate) return timestamp.toDate().toLocaleString('pt-BR');
  if (typeof timestamp === 'number') return new Date(timestamp).toLocaleString('pt-BR');
  if (typeof timestamp === 'string') return timestamp;
  return '—';
}

function applyHeaderStyle(ws, rowCount) {
  const cols = Object.keys(ws).filter(k => k.startsWith('A1') || /^A[0-9]+$/.test(k));
  for (let i = 0; i < cols.length; i++) {
    const cell = ws[cols[i]];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: '1a73e8' } },
        font: { color: { rgb: 'ffffff' }, bold: true },
        alignment: { horizontal: 'center' }
      };
    }
  }
}

function applyTableBorders(ws, rowCount, colCount) {
  const range = XLSX.utils.decode_range(`A1:${String.fromCharCode(64 + colCount)}${rowCount + 1}`);
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = ws[addr].s || {};
      ws[addr].s.border = {
        top: { style: 'thin', color: { rgb: 'dddddd' } },
        bottom: { style: 'thin', color: { rgb: 'dddddd' } },
        left: { style: 'thin', color: { rgb: 'dddddd' } },
        right: { style: 'thin', color: { rgb: 'dddddd' } }
      };
    }
  }
}