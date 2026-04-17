import { Client, Storage, ID } from 'appwrite';
import { appwriteConfig as awConfig } from './config.js';

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

export async function uploadVideo(file) {
  if (!storage || !bucketId) {
    throw new Error('Appwrite Storage não configurado.');
  }

  const uploaded = await storage.createFile(bucketId, ID.unique(), file);
  return {
    fileId: uploaded.$id,
    fileName: uploaded.name,
    sizeOriginal: uploaded.sizeOriginal,
    mimeType: uploaded.mimeType,
  };
}

export async function deleteVideoFile(fileId) {
  if (!storage || !bucketId || !fileId) return;
  await storage.deleteFile(bucketId, fileId);
}
