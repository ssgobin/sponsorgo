import { 
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  getDoc,
  updateDoc,
  deleteField
} from 'firebase/firestore';
import { hasFirebaseConfig, db as firebaseDb } from './firebase.js';

const HOURS_COLLECTION = 'hoursTracking';
const ALERTS_COLLECTION = 'hoursAlerts';
const DAILY_GOAL_HOURS = 8;

let db = firebaseDb;

export function initHoursFirebase(firestoreDb) {
  if (firestoreDb) {
    db = firestoreDb;
  }
}

export async function saveHoursRecord(payload) {
  if (!db || !hasFirebaseConfig) {
    console.warn('Firebase não configurado para salvar horas');
    return null;
  }

  const docId = `${payload.deviceId}_${payload.date}`;
  const ref = doc(db, HOURS_COLLECTION, docId);
  
  try {
    const existing = await getDoc(ref);
    
    if (existing.exists()) {
      const data = existing.data();
      await updateDoc(ref, {
        drivingSeconds: payload.drivingSeconds,
        propagandaSeconds: payload.propagandaSeconds,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return docId;
  } catch (error) {
    console.error('Erro ao salvar registro de horas:', error);
    throw error;
  }
}

export async function fetchHoursByDateRange(startDate, endDate) {
  if (!db || !hasFirebaseConfig) return [];
  
  try {
    const q = query(
      collection(db, HOURS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erro ao buscar horas por período:', error);
    return [];
  }
}

export async function fetchHoursByDevice(deviceId, startDate, endDate) {
  if (!db || !hasFirebaseConfig) return [];
  
  try {
    const q = query(
      collection(db, HOURS_COLLECTION),
      where('deviceId', '==', deviceId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erro ao buscar horas do dispositivo:', error);
    return [];
  }
}

export async function fetchTodayHours() {
  const today = new Date().toISOString().split('T')[0];
  return fetchHoursByDateRange(today, today);
}

export async function fetchMonthHours(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return fetchHoursByDateRange(startDate, endDate);
}

export async function createAlert(deviceId, driver, date, drivingHours, goalHours) {
  if (!db || !hasFirebaseConfig) return null;
  
  const alertId = `${deviceId}_${date}`;
  const ref = doc(db, ALERTS_COLLECTION, alertId);
  
  try {
    await setDoc(ref, {
      deviceId,
      driver: driver || 'Motorista',
      date,
      drivingHours,
      goalHours,
      difference: goalHours - drivingHours,
      dismissed: false,
      createdAt: serverTimestamp()
    });
    
    return alertId;
  } catch (error) {
    console.error('Erro ao criar alerta:', error);
    throw error;
  }
}

export async function fetchActiveAlerts() {
  if (!db || !hasFirebaseConfig) return [];
  
  try {
    const q = query(
      collection(db, ALERTS_COLLECTION),
      where('dismissed', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    return [];
  }
}

export async function dismissAlert(alertId) {
  if (!db || !hasFirebaseConfig) return;
  
  try {
    const ref = doc(db, ALERTS_COLLECTION, alertId);
    await updateDoc(ref, {
      dismissed: true,
      dismissedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Erro ao dispensar alerta:', error);
    throw error;
  }
}

export async function checkAndCreateAlerts(devices, hoursData) {
  if (!db || !hasFirebaseConfig) return [];
  
  const today = new Date().toISOString().split('T')[0];
  const alerts = [];
  
  for (const device of devices) {
    const deviceHours = hoursData.find(h => h.deviceId === device.id && h.date === today);
    const drivingHours = deviceHours ? (deviceHours.drivingSeconds || 0) / 3600 : 0;
    
    if (drivingHours < DAILY_GOAL_HOURS) {
      const alertId = await createAlert(
        device.id,
        device.driver,
        today,
        drivingHours,
        DAILY_GOAL_HOURS
      );
      
      if (alertId) {
        alerts.push({
          id: alertId,
          deviceId: device.id,
          driver: device.driver || 'Motorista',
          deviceName: device.name,
          drivingHours: drivingHours.toFixed(2),
          goalHours: DAILY_GOAL_HOURS,
          difference: (DAILY_GOAL_HOURS - drivingHours).toFixed(2)
        });
      }
    }
  }
  
  return alerts;
}

export function subscribeToHours(callback) {
  if (!db || !hasFirebaseConfig) return () => {};
  
  const q = query(
    collection(db, HOURS_COLLECTION),
    orderBy('date', 'desc'),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  });
}

export function subscribeToAlerts(callback) {
  if (!db || !hasFirebaseConfig) return () => {};
  
  const q = query(
    collection(db, ALERTS_COLLECTION),
    where('dismissed', '==', false),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(data);
  });
}

export async function exportHoursToExcel(hoursData, devices) {
  const data = hoursData.map(hour => {
    const device = devices.find(d => d.id === hour.deviceId);
    return {
      'Data': hour.date,
      'Tablet': device?.name || hour.deviceId,
      'Veículo': device?.car || '-',
      'Motorista': device?.driver || '-',
      'Horas Rodadas': ((hour.drivingSeconds || 0) / 3600).toFixed(2),
      'Horas Propaganda': ((hour.propagandaSeconds || 0) / 3600).toFixed(2),
      '% Propaganda': hour.drivingSeconds > 0 
        ? (((hour.propagandaSeconds || 0) / hour.drivingSeconds) * 100).toFixed(1)
        : '0'
    };
  });
  
  return data;
}

export { DAILY_GOAL_HOURS };
