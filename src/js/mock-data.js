export const mockMetrics = {
  onlineDevices: 8,
  offlineDevices: 2,
  syncedToday: 14,
  activeVideos: 12,
};

export const mockDevices = [
  { id: 'TAB-001', name: 'Tablet Corolla 01', car: 'Toyota Corolla', driver: 'Carlos', status: 'online', battery: 83, currentVideo: 'Promo Abril 01', lastSeen: 'Agora mesmo', sync: 'OK' },
  { id: 'TAB-002', name: 'Tablet Onix 03', car: 'Chevrolet Onix', driver: 'Fernanda', status: 'syncing', battery: 61, currentVideo: 'Oferta Parceiro 02', lastSeen: 'há 1 min', sync: 'Sincronizando' },
  { id: 'TAB-003', name: 'Tablet HB20 07', car: 'Hyundai HB20', driver: 'Rafael', status: 'offline', battery: 14, currentVideo: 'Sem reprodução', lastSeen: 'há 26 min', sync: 'Sem contato' },
];

export const mockVideos = [
  { id: 'VID-001', title: 'Promo Abril 01', duration: '00:30', size: '24 MB', status: 'Ativo', fileName: 'promo-abril-01.mp4' },
  { id: 'VID-002', title: 'Oferta Parceiro 02', duration: '00:45', size: '38 MB', status: 'Ativo', fileName: 'oferta-parceiro-02.mp4' },
  { id: 'VID-003', title: 'Institucional SponsorGo', duration: '00:20', size: '18 MB', status: 'Rascunho', fileName: 'institucional.mp4' },
];

export const mockPlaylists = [
  { id: 'PL-001', name: 'Campanha Abril', devices: 5, videos: 6, updatedAt: 'Hoje, 09:42', status: 'Ativa' },
  { id: 'PL-002', name: 'Parceiros Premium', devices: 3, videos: 4, updatedAt: 'Ontem, 18:10', status: 'Ativa' },
];

export const mockActivity = [
  { title: 'Tablet Corolla 01 enviou heartbeat', detail: 'Vídeo Promo Abril 01 em execução', when: 'agora' },
  { title: 'Playlist Campanha Abril atualizada', detail: '6 vídeos atribuídos a 5 tablets', when: 'há 8 min' },
  { title: 'Tablet HB20 07 offline', detail: 'Último contato há 26 min', when: 'há 26 min' },
];
