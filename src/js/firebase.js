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

export async function fetchCollection(name) {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, name), orderBy('createdAt', 'desc')));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function deleteDocument(collectionName, docId) {
  if (!db) throw new Error('Firebase não configurado.');
  await deleteDoc(doc(db, collectionName, docId));
}

export async function assignPlaylistToDevice(deviceId, playlistId) {
  if (!db) throw new Error('Firebase não configurado.');
  const ref = doc(db, 'deviceAssignments', deviceId);
  await setDoc(ref, { playlistId, updatedAt: serverTimestamp() });
  return ref.id;
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
    const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
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

export async function rejectConnectionRequest(deviceId) {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'connectionRequests', deviceId), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
  }, { merge: true });
}
