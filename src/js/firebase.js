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
  await setDoc(ref, {
    ...payload,
    version: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function addPlaylistSchedule(payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(collection(db, 'playlistSchedules'));
  await setDoc(ref, {
    ...payload,
    active: payload.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
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
    const batch = writeBatch(db);
    batch.update(doc(db, collectionName, docId), {
      status: 'Inativa',
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: Date.now(),
    });

    const assignedDevices = await getDocs(query(
      collection(db, 'deviceAssignments'),
      where('playlistId', '==', docId)
    ));
    assignedDevices.forEach((item) => batch.delete(item.ref));

    const schedulesSnap = await getDocs(query(
      collection(db, 'playlistSchedules'),
      where('playlistId', '==', docId)
    ));
    schedulesSnap.forEach((item) => batch.delete(item.ref));

    await batch.commit();
  } else if (collectionName === 'devices') {
    const batch = writeBatch(db);
    batch.delete(doc(db, collectionName, docId));
    batch.delete(doc(db, 'deviceAssignments', docId));
    batch.set(doc(db, 'connectionRequests', docId), {
      status: 'removed',
      removedAt: serverTimestamp(),
    }, { merge: true });

    const playlistsSnap = await getDocs(collection(db, 'playlists'));
    playlistsSnap.forEach((item) => {
      const playlist = item.data();
      const devices = Array.isArray(playlist.devices) ? playlist.devices : [];
      if (devices.includes(docId)) {
        batch.update(item.ref, {
          devices: devices.filter((deviceId) => deviceId !== docId),
          updatedAt: serverTimestamp(),
          version: Date.now(),
        });
      }
    });

    const schedulesSnap = await getDocs(collection(db, 'playlistSchedules'));
    schedulesSnap.forEach((item) => {
      const schedule = item.data();
      const deviceIds = Array.isArray(schedule.deviceIds) ? schedule.deviceIds : [];
      if (deviceIds.includes(docId)) {
        const filteredDeviceIds = deviceIds.filter((deviceId) => deviceId !== docId);
        if (filteredDeviceIds.length === 0) {
          batch.delete(item.ref);
        } else {
          batch.update(item.ref, {
            deviceIds: filteredDeviceIds,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    await batch.commit();
  } else if (collectionName === 'videos') {
    const batch = writeBatch(db);
    batch.delete(doc(db, collectionName, docId));

    const playlistsSnap = await getDocs(collection(db, 'playlists'));
    playlistsSnap.forEach((item) => {
      const playlist = item.data();
      const videos = Array.isArray(playlist.videos) ? playlist.videos : [];
      const filteredVideos = videos.filter((video) => video?.id !== docId);

      if (filteredVideos.length !== videos.length) {
        batch.update(item.ref, {
          videos: filteredVideos,
          updatedAt: serverTimestamp(),
          version: Date.now(),
        });
      }
    });

    await batch.commit();
  } else if (collectionName === 'playlistSchedules') {
    await deleteDoc(doc(db, collectionName, docId));
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
  await setDoc(ref, { playlistId, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function syncPlaylistAssignments(playlistId, deviceIds = []) {
  if (!db) throw new Error('Firebase não configurado.');

  const selectedIds = [...new Set(deviceIds.filter(Boolean))];
  const currentSnap = await getDocs(query(
    collection(db, 'deviceAssignments'),
    where('playlistId', '==', playlistId)
  ));
  const selectedSet = new Set(selectedIds);
  const batch = writeBatch(db);

  currentSnap.forEach((item) => {
    if (!selectedSet.has(item.id)) {
      batch.delete(item.ref);
    }
  });

  selectedIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  batch.update(doc(db, 'playlists', playlistId), {
    devices: selectedIds,
    updatedAt: serverTimestamp(),
    version: Date.now(),
  });

  await batch.commit();
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
  await setDoc(ref, {
    ...payload,
    version: Date.now(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
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

export function subscribeToPlaylistSchedules(callback) {
  if (!db) return () => {};
  const q = query(collection(db, 'playlistSchedules'), orderBy('createdAt', 'desc'));
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

export async function rejectConnectionRequest(deviceId) {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'connectionRequests', deviceId), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  }, { merge: true });
}
