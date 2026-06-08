import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { hasFirebaseConfig, db } from './firebase.js';

const CAMPAIGN_METRICS_COLLECTION = 'campaignMetrics';
const PLAYBACK_PROOFS_COLLECTION = 'playbackProofs';

async function fetchSubcollection(parentRef, name) {
  const snap = await getDocs(collection(parentRef, name));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function fetchCampaignReports(startDate, endDate) {
  if (!db || !hasFirebaseConfig) {
    return { metrics: [], proofs: [] };
  }

  const metricsQuery = query(
    collection(db, CAMPAIGN_METRICS_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );

  const proofsQuery = query(
    collection(db, PLAYBACK_PROOFS_COLLECTION),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );

  const [metricsSnap, proofsSnap] = await Promise.all([
    getDocs(metricsQuery),
    getDocs(proofsQuery),
  ]);

  const metrics = await Promise.all(metricsSnap.docs.map(async (metricDoc) => {
    const metric = { id: metricDoc.id, ...metricDoc.data() };
    const metricRef = doc(db, CAMPAIGN_METRICS_COLLECTION, metricDoc.id);
    const videosSnap = await getDocs(collection(metricRef, 'videos'));

    const videos = await Promise.all(videosSnap.docs.map(async (videoDoc) => {
      const video = { id: videoDoc.id, ...videoDoc.data() };
      const videoRef = doc(metricRef, 'videos', videoDoc.id);
      const [hours, neighborhoods, cities] = await Promise.all([
        fetchSubcollection(videoRef, 'hours'),
        fetchSubcollection(videoRef, 'neighborhoods'),
        fetchSubcollection(videoRef, 'cities'),
      ]);

      return { ...video, hours, neighborhoods, cities };
    }));

    return { ...metric, videos };
  }));

  const proofs = proofsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));

  return { metrics, proofs };
}

export async function exportCampaignReportRows(metrics = [], proofs = []) {
  const campaignRows = metrics.flatMap((campaign) => {
    const videos = campaign.videos?.length ? campaign.videos : [{ videoId: '', videoName: '' }];
    return videos.map((video) => ({
      'Data': campaign.date || '',
      'Campanha': campaign.playlistName || campaign.playlistId || '',
      'Video': video.videoName || video.videoId || '',
      'Loops': video.loops || 0,
      'Tempo exibido (h)': ((video.totalPlaybackSeconds || 0) / 3600).toFixed(2),
      'Tablets': Array.isArray(video.devices) ? video.devices.length : 0,
    }));
  });

  const proofRows = proofs.map((proof) => ({
    'Data': proof.date || '',
    'Hora': proof.hour || '',
    'Campanha': proof.playlistName || proof.playlistId || '',
    'Video': proof.videoName || proof.videoId || '',
    'Tablet': proof.deviceId || '',
    'Motorista': proof.driver || '',
    'Inicio': proof.startedAt ? new Date(proof.startedAt).toLocaleString('pt-BR') : '',
    'Fim': proof.endedAt ? new Date(proof.endedAt).toLocaleString('pt-BR') : '',
    'Duracao (s)': proof.durationSeconds || 0,
    'Cidade': proof.endLocation?.city || '',
    'Bairro': proof.endLocation?.neighborhood || '',
    'Motivo fim': proof.endReason || '',
  }));

  return { campaignRows, proofRows };
}
