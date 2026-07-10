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
  increment,
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

async function getDeviceOwners(deviceIds = [], strict = false) {
  const uniqueIds = [...new Set(deviceIds.filter(Boolean))];
  const snapshots = await Promise.all(uniqueIds.map((deviceId) => getDoc(doc(db, 'devices', deviceId))));
  const owners = new Map(snapshots.map((snapshot, index) => [uniqueIds[index], snapshot.get('ownerUid') || '']));
  if (strict) {
    const invalidDeviceId = uniqueIds.find((deviceId) => !owners.get(deviceId));
    if (invalidDeviceId) throw new Error(`O tablet ${invalidDeviceId} precisa ser reconectado antes de receber uma playlist.`);
  }
  return owners;
}

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
  await setDoc(ref, { ...payload, version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function addGeofenceRule(payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(collection(db, 'geofenceRules'));
  await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateGeofenceRule(ruleId, payload) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'geofenceRules', ruleId);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function addPlaylistWithAssignments(payload, selectedDeviceIds = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const playlistRef = doc(collection(db, 'playlists'));
  const batch = writeBatch(db);
  batch.set(playlistRef, {
    ...payload,
    version: 1,
    devices: selectedDeviceIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const owners = await getDeviceOwners(selectedDeviceIds, true);
  selectedDeviceIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId: playlistRef.id,
      ownerUid: owners.get(deviceId) || '',
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
    version: increment(1),
    devices: selectedDeviceIds,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const selectedOwners = await getDeviceOwners(selectedDeviceIds, true);
  const previousOwners = await getDeviceOwners(previousDeviceIds);
  const owners = new Map([...previousOwners, ...selectedOwners]);
  selectedDeviceIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId,
      ownerUid: owners.get(deviceId) || '',
      updatedAt: serverTimestamp(),
    });
  });

  previousDeviceIds.forEach((deviceId) => {
    if (!selected.has(deviceId)) {
      batch.set(doc(db, 'deviceAssignments', deviceId), {
        playlistId: '',
        ownerUid: owners.get(deviceId) || '',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  });

  await batch.commit();
  return playlistId;
}

export async function softDeletePlaylistWithAssignments(playlistId, deviceIds = []) {
  if (!db) throw new Error('Firebase nao configurado.');
  const assignmentDeviceIds = new Set(deviceIds.filter(Boolean));
  const playlistSnap = await getDoc(doc(db, 'playlists', playlistId));

  if (playlistSnap.exists()) {
    const playlistDevices = playlistSnap.get('devices');
    if (Array.isArray(playlistDevices)) {
      playlistDevices.forEach((device) => {
        const deviceId = typeof device === 'string' ? device : device?.id;
        if (deviceId) assignmentDeviceIds.add(deviceId);
      });
    }
  }

  const assignmentsSnap = await getDocs(query(
    collection(db, 'deviceAssignments'),
    where('playlistId', '==', playlistId)
  ));

  assignmentsSnap.docs.forEach((assignment) => {
    assignmentDeviceIds.add(assignment.id);
  });
  const batch = writeBatch(db);

  batch.set(doc(db, 'playlists', playlistId), {
    deletedAt: serverTimestamp(),
    status: 'Excluída',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const owners = await getDeviceOwners([...assignmentDeviceIds]);
  assignmentDeviceIds.forEach((deviceId) => {
    batch.set(doc(db, 'deviceAssignments', deviceId), {
      playlistId: '',
      ownerUid: owners.get(deviceId) || '',
      updatedAt: serverTimestamp(),
    }, { merge: true });
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
      version: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
}

export async function fetchCollection(name, includeDeleted = false) {
  if (!db) return [];
  // Sorting in Firestore excludes documents that do not have createdAt.
  // Sort locally so legacy records remain manageable in the panel.
  const q = query(collection(db, name));
  const snap = await getDocs(q);
  let data = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
  
  if (name === 'playlists' && !includeDeleted) {
    data = data.filter(p => !p.deletedAt);
  }
  
  return data;
}

export async function fetchLocationTrack(deviceId, date) {
  if (!db || !deviceId || !date) return [];
  const q = query(
    collection(db, 'locationBatches'),
    where('deviceId', '==', deviceId),
    where('date', '==', date)
  );
  const snap = await getDocs(q);
  return snap.docs
    .flatMap((item) => Array.isArray(item.data().points) ? item.data().points : [])
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
}

export async function deleteDocument(collectionName, docId) {
  if (!db) throw new Error('Firebase não configurado.');
  
  if (collectionName === 'playlists') {
    await updateDoc(doc(db, collectionName, docId), { deletedAt: serverTimestamp(), status: 'Excluída' });
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
  const owners = await getDeviceOwners([deviceId], true);
  await setDoc(ref, { playlistId, ownerUid: owners.get(deviceId) || '', updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function unassignPlaylistFromDevice(deviceId, playlistId = null) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'deviceAssignments', deviceId);

  if (playlistId) {
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.get('playlistId') !== playlistId) return;
  }

  const owners = await getDeviceOwners([deviceId]);
  await setDoc(ref, { playlistId: '', ownerUid: owners.get(deviceId) || '', updatedAt: serverTimestamp() }, { merge: true });
}

function timestampMillis(value) {
  if (typeof value === 'number') return value;
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export async function deleteDeviceWithRelations(deviceId, ownerUid = '', affectedPlaylists = []) {
  if (!db) throw new Error('Firebase não configurado.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'devices', deviceId));
  batch.delete(doc(db, 'deviceAssignments', deviceId));
  batch.delete(doc(db, 'connectionRequests', deviceId));
  if (ownerUid) batch.delete(doc(db, 'deviceCommands', ownerUid));
  affectedPlaylists.forEach((playlist) => {
    batch.set(doc(db, 'playlists', playlist.id), {
      devices: playlist.devices,
      version: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

export function subscribeToDevices(callback, onError = console.error) {
  if (!db) return () => {};
  // Do not order on Firestore: orderBy excludes legacy documents without createdAt.
  const q = query(collection(db, 'devices'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    callback(data);
  }, onError);
}

export function subscribeToPlaylists(callback, onError = console.error) {
  if (!db) return () => {};
  const q = query(collection(db, 'playlists'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((playlist) => !playlist.deletedAt)
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    callback(data);
  }, onError);
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
  await setDoc(ref, { ...payload, version: increment(1), updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export function subscribeToConnectionRequests(callback, onError = console.error) {
  if (!db) return () => {};
  // Keep legacy requests visible even when they do not contain createdAt.
  const q = query(collection(db, 'connectionRequests'));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    callback(data);
  }, onError);
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
  const requestRef = doc(db, 'connectionRequests', deviceId);
  const requestSnap = await getDoc(requestRef);
  const ownerUid = requestSnap.get('ownerUid') || '';
  if (!ownerUid) throw new Error('A solicitação não possui ownerUid. Atualize o app do tablet e tente novamente.');
  const batch = writeBatch(db);

  batch.set(doc(db, 'devices', deviceId), {
    ...devicePayload,
    ownerUid,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(doc(db, 'deviceAssignments', deviceId), {
    ownerUid,
    playlistId: '',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.set(doc(db, 'connectionRequests', deviceId), {
    status: 'approved',
    approvedAt: serverTimestamp(),
    approvedBy: approvalPayload.approvedBy || 'admin',
  }, { merge: true });

  await batch.commit();
}

export async function sendDeviceCommand(device, type, payload = {}) {
  if (!db) throw new Error('Firebase não configurado.');
  if (!device?.ownerUid) throw new Error('Este tablet ainda não possui identidade segura (ownerUid).');
  const commandId = crypto.randomUUID();
  await setDoc(doc(db, 'deviceCommands', device.ownerUid), {
    deviceId: device.id,
    ownerUid: device.ownerUid,
    commandId,
    type,
    payload,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + (15 * 60 * 1000),
  });
  return commandId;
}

export async function rejectConnectionRequest(deviceId) {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'connectionRequests', deviceId), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  }, { merge: true });
}

