import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  getDoc,
  where,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { firebaseConfig as fbConfig } from './config.js';

const firebaseConfig = fbConfig;

export const hasFirebaseConfig = Boolean(firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('SUA_'));

let app;
let auth;
let db;

if (hasFirebaseConfig) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, collection, addDoc, doc, setDoc, getDocs, query, orderBy, serverTimestamp, where };

export async function addDevice(payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'devices', payload.id);
  await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addVideoMetadata(payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(collection(db, 'videos'));
  await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addPlaylist(payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(collection(db, 'playlists'));
  await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addPlaylistWithAssignments(payload, selectedDeviceIds = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const playlistRef = doc(collection(db, 'playlists'));
  const batch = writeBatch(db);

  batch.set(playlistRef, {
    ...payload,
    devices: selectedDeviceIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  selectedDeviceIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId: playlistRef.id,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return playlistRef.id;
}

export async function updatePlaylistWithAssignments(playlistId, payload, previousDeviceIds = [], selectedDeviceIds = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const batch = writeBatch(db);
  const selected = new Set(selectedDeviceIds);

  batch.set(doc(db, 'playlists', playlistId), {
    ...payload,
    devices: selectedDeviceIds,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  selectedDeviceIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId,
      updatedAt: serverTimestamp(),
    });
  });

  previousDeviceIds.forEach((deviceId) => {
    if (!selected.has(deviceId)) {
      batch.delete(doc(db, 'deviceAssignments', deviceId));
    }
  });

  await batch.commit();
  return playlistId;
}

export async function softDeletePlaylistWithAssignments(playlistId, deviceIds = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const batch = writeBatch(db);

  batch.set(doc(db, 'playlists', playlistId), {
    deletedAt: serverTimestamp(),
    status: 'Excluída',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  deviceIds.forEach((deviceId) => {
    batch.delete(doc(db, 'deviceAssignments', deviceId));
  });

  await batch.commit();
}

export async function deleteVideoMetadata(videoId) {
  if (!db) throw new Error('Firebase não configurado.');
  await deleteDoc(doc(db, 'videos', videoId));
}

export async function deleteVideoAndPrunePlaylists(videoId, affectedPlaylists = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const batch = writeBatch(db);

  batch.delete(doc(db, 'videos', videoId));

  affectedPlaylists.forEach((playlist) => {
    batch.set(doc(db, 'playlists', playlist.id), {
      videos: playlist.videos,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

export async function fetchCollection(name, includeDeleted = false) {
  if (!db) return [];
  const q = query(collection(db, name), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  let data = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  
  if (name === 'playlists' && !includeDeleted) {
    data = data.filter(p => !p.deletedAt);
  }
  
  return data;
}

export async function deleteDocument(collectionName, docId) {
  if (!db) throw new Error('Firebase não configurado.');
  
  if (collectionName === 'playlists') {
    await updateDoc(doc(db, collectionName, docId), { deletedAt: serverTimestamp(), status: 'ExcluÃ­da' });
  } else {
    await deleteDoc(doc(db, collectionName, docId));
  }
}

export async function permanentlyDeletePlaylist(docId) {
  if (!db) throw new Error('Firebase não configurado.');
  await deleteDoc(doc(db, 'playlists', docId));
}

export async function assignPlaylistToDevice(deviceId, playlistId) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'deviceAssignments', deviceId);
  await setDoc(ref, { playlistId, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function unassignPlaylistFromDevice(deviceId, playlistId = null) {
  if (!db) throw new Error('Firebase nÃ£o configurado.');
  const ref = doc(db, 'deviceAssignments', deviceId);

  if (playlistId) {
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.get('playlistId') !== playlistId) return;
  }

  await deleteDoc(ref);
}

export function subscribeToDevices(callback) {
  if (!db) return () => {};
  const q = query(collection(db, 'devices'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(data);
  });
}

export function subscribeToPlaylists(callback) {
  if (!db) return () => {};
  const q = query(collection(db, 'playlists'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((playlist) => !playlist.deletedAt);
    callback(data);
  });
}

export async function updateDevice(deviceId, payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'devices', deviceId);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function updatePlaylist(playlistId, payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'playlists', playlistId);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export function subscribeToConnectionRequests(callback) {
  if (!db) return () => {};
  const q = query(collection(db, 'connectionRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(data);
  });
}

export async function approveConnectionRequest(deviceId, payload) {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'connectionRequests', deviceId), {
    status: 'approved',
    approvedAt: serverTimestamp(),
    approvedBy: payload.approvedBy || 'admin',
  }, { merge: true });
}

export async function approveConnectionWithDevice(deviceId, devicePayload, approvalPayload = {}) {
  if (!db) throw new Error('Firebase não configurado.');
  const batch = writeBatch(db);

  batch.set(doc(db, 'devices', deviceId), {
    ...devicePayload,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(doc(db, 'connectionRequests', deviceId), {
    status: 'approved',
    approvedAt: serverTimestamp(),
    approvedBy: approvalPayload.approvedBy || 'admin',
  }, { merge: true });

  await batch.commit();
}

export async function rejectConnectionRequest(deviceId) {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'connectionRequests', deviceId), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  }, { merge: true });
}
