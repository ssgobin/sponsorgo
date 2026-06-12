import { Client, Storage, ID } from 'appwrite';
import { appwriteConfig as awConfig } from './config.js';
import { compressVideoFile } from './video-compression.js';

const appwriteConfig = awConfig;

export const hasAppwriteConfig = Boolean(appwriteConfig && appwriteConfig.projectId && !appwriteConfig.projectId.includes('SEU_'));

let storage;
let bucketId;

if (hasAppwriteConfig) {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpoint)
    .setProject(appwriteConfig.projectId);

  storage = new Storage(client);
  bucketId = appwriteConfig.bucketId;
}

function assertStorageReady() {
  if (!storage || !bucketId) {
    throw new Error('Appwrite Storage nao configurado.');
  }
}

export function getVideoFileUrls(fileId) {
  if (!storage || !bucketId || !fileId) {
    return { viewUrl: '', downloadUrl: '' };
  }

  return {
    viewUrl: storage.getFileView(bucketId, fileId),
    downloadUrl: storage.getFileDownload(bucketId, fileId),
  };
}

export async function uploadVideo(file, onProgress, onCompressionStatus) {
  assertStorageReady();

  const compression = await compressVideoFile(file, onCompressionStatus);

  if (!compression.compressed) {
    throw new Error('Nao foi possivel reduzir o tamanho do video selecionado. Tente outro arquivo ou um video em maior qualidade.');
  }

  const uploaded = await storage.createFile(bucketId, ID.unique(), compression.file, undefined, onProgress);
  const urls = getVideoFileUrls(uploaded.$id);

  return {
    fileId: uploaded.$id,
    fileName: uploaded.name,
    sizeOriginal: uploaded.sizeOriginal,
    mimeType: uploaded.mimeType,
    originalSizeBeforeCompression: compression.originalSize,
    compressedSize: compression.compressedSize,
    wasCompressed: compression.compressed,
    ...urls,
  };
}

export async function deleteVideoFile(fileId) {
  if (!storage || !bucketId || !fileId) return;
  await storage.deleteFile(bucketId, fileId);
}
