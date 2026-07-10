import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { hasFirebaseConfig, db } from './firebase.js';

const PLAYBACK_BATCHES_COLLECTION = 'playbackBatches';

function aggregateProofs(proofs) {
  const campaigns = new Map();

  proofs.forEach((proof) => {
    const campaignKey = `${proof.playlistId || 'unknown'}_${proof.date || ''}`;
    if (!campaigns.has(campaignKey)) {
      campaigns.set(campaignKey, {
        id: campaignKey,
        playlistId: proof.playlistId || '',
        playlistName: proof.playlistName || '',
        date: proof.date || '',
        totalPlaybackSeconds: 0,
        totalLoops: 0,
        devices: [],
        videos: [],
      });
    }

    const campaign = campaigns.get(campaignKey);
    const duration = Number(proof.durationSeconds || 0);
    campaign.totalPlaybackSeconds += duration;
    campaign.totalLoops += 1;
    if (proof.deviceId && !campaign.devices.includes(proof.deviceId)) campaign.devices.push(proof.deviceId);

    let video = campaign.videos.find((item) => item.videoId === proof.videoId);
    if (!video) {
      video = {
        id: proof.videoId || 'unknown',
        videoId: proof.videoId || '',
        videoName: proof.videoName || '',
        totalPlaybackSeconds: 0,
        loops: 0,
        devices: [],
        hours: [],
        neighborhoods: [],
        cities: [],
      };
      campaign.videos.push(video);
    }

    video.totalPlaybackSeconds += duration;
    video.loops += 1;
    if (proof.deviceId && !video.devices.includes(proof.deviceId)) video.devices.push(proof.deviceId);

    const hour = proof.hour || '';
    let hourMetric = video.hours.find((item) => item.hour === hour);
    if (!hourMetric) {
      hourMetric = { hour, loops: 0, totalPlaybackSeconds: 0 };
      video.hours.push(hourMetric);
    }
    hourMetric.loops += 1;
    hourMetric.totalPlaybackSeconds += duration;

    const location = proof.endLocation || {};
    if (location.neighborhood) {
      let metric = video.neighborhoods.find((item) => item.neighborhood === location.neighborhood);
      if (!metric) {
        metric = { neighborhood: location.neighborhood, city: location.city || '', loops: 0, totalPlaybackSeconds: 0 };
        video.neighborhoods.push(metric);
      }
      metric.loops += 1;
      metric.totalPlaybackSeconds += duration;
    }
    if (location.city) {
      let metric = video.cities.find((item) => item.city === location.city);
      if (!metric) {
        metric = { city: location.city, state: location.state || '', loops: 0, totalPlaybackSeconds: 0 };
        video.cities.push(metric);
      }
      metric.loops += 1;
      metric.totalPlaybackSeconds += duration;
    }
  });

  return [...campaigns.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function fetchCampaignReports(startDate, endDate) {
  if (!db || !hasFirebaseConfig) return { metrics: [], proofs: [] };

  const batchesQuery = query(
    collection(db, PLAYBACK_BATCHES_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(batchesQuery);
  const proofs = snapshot.docs
    .flatMap((batch) => Array.isArray(batch.data().events) ? batch.data().events : [])
    .filter((event) => event.date >= startDate && event.date <= endDate)
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));

  return { metrics: aggregateProofs(proofs), proofs };
}

export async function exportCampaignReportRows(metrics = [], proofs = []) {
  const campaignRows = metrics.flatMap((campaign) => {
    const videos = campaign.videos?.length ? campaign.videos : [{ videoId: '', videoName: '' }];
    return videos.map((video) => ({
      'Data': campaign.date || '',
      'Campanha': campaign.playlistName || campaign.playlistId || '',
      'Vídeo': video.videoName || video.videoId || '',
      'Exibições': video.loops || 0,
      'Tempo exibido (h)': ((video.totalPlaybackSeconds || 0) / 3600).toFixed(2),
      'Tablets': Array.isArray(video.devices) ? video.devices.length : 0,
    }));
  });

  const proofRows = proofs.map((proof) => ({
    'Data': proof.date || '',
    'Hora': proof.hour || '',
    'Campanha': proof.playlistName || proof.playlistId || '',
    'Vídeo': proof.videoName || proof.videoId || '',
    'Tablet': proof.deviceId || '',
    'Motorista': proof.driver || '',
    'Início': proof.startedAt ? new Date(proof.startedAt).toLocaleString('pt-BR') : '',
    'Fim': proof.endedAt ? new Date(proof.endedAt).toLocaleString('pt-BR') : '',
    'Duração (s)': proof.durationSeconds || 0,
    'Cidade': proof.endLocation?.city || '',
    'Bairro': proof.endLocation?.neighborhood || '',
    'Motivo': proof.endReason || '',
  }));

  return { campaignRows, proofRows };
}
