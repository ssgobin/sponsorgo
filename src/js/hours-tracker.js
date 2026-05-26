const HOURS_COLLECTION = 'hoursTracking';
const ALERTS_COLLECTION = 'hoursAlerts';
const DAILY_GOAL_HOURS = 8;

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class HoursTracker {
  constructor(deviceId) {
    this.deviceId = deviceId;
    this.isRunning = false;
    this.startTime = null;
    this.drivingSeconds = 0;
    this.propagandaSeconds = 0;
    this.isPropagandaPlaying = false;
    this.lastSaveTime = Date.now();
    this.saveInterval = 60 * 1000;
    this.storageKey = `hoursTracker_${deviceId}`;
    this.loadState();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        this.drivingSeconds = data.drivingSeconds || 0;
        this.propagandaSeconds = data.propagandaSeconds || 0;
        this.isRunning = data.isRunning || false;
        this.startTime = data.startTime ? new Date(data.startTime) : null;
        this.isPropagandaPlaying = data.isPropagandaPlaying || false;
        
        if (this.isRunning && this.startTime) {
          const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
          this.drivingSeconds += elapsed;
          this.startTime = Date.now();
        }
      }
    } catch (e) {
      console.error('Erro ao carregar estado do tracker:', e);
    }
  }

  saveState() {
    try {
      const data = {
        drivingSeconds: this.drivingSeconds,
        propagandaSeconds: this.propagandaSeconds,
        isRunning: this.isRunning,
        startTime: this.startTime,
        isPropagandaPlaying: this.isPropagandaPlaying,
        lastUpdate: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Erro ao salvar estado do tracker:', e);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();
    this.saveState();
    console.log(`[HoursTracker] Iniciado para dispositivo ${this.deviceId}`);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.startTime) {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.drivingSeconds += elapsed;
    }
    this.startTime = null;
    this.saveState();
    console.log(`[HoursTracker] Pausado - Total: ${this.formatTime(this.drivingSeconds)}`);
  }

  startPropaganda() {
    this.isPropagandaPlaying = true;
    this.saveState();
  }

  stopPropaganda() {
    this.isPropagandaPlaying = false;
    this.saveState();
  }

  tick() {
    if (!this.isRunning) return;
    
    this.drivingSeconds += 1;
    
    if (this.isPropagandaPlaying) {
      this.propagandaSeconds += 1;
    }

    const now = Date.now();
    if (now - this.lastSaveTime >= this.saveInterval) {
      this.saveState();
      this.syncToFirebase();
      this.lastSaveTime = now;
    }
  }

  async syncToFirebase() {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      try {
        const db = firebase.firestore();
        const today = getLocalDateString();
        
        const docRef = db.collection(HOURS_COLLECTION).doc(`${this.deviceId}_${today}`);
        
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          
          if (doc.exists) {
            const data = doc.data();
            transaction.update(docRef, {
              drivingSeconds: (data.drivingSeconds || 0) + this.drivingSeconds,
              propagandaSeconds: (data.propagandaSeconds || 0) + this.propagandaSeconds,
              lastSync: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            transaction.set(docRef, {
              deviceId: this.deviceId,
              date: today,
              drivingSeconds: this.drivingSeconds,
              propagandaSeconds: this.propagandaSeconds,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastSync: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        });
        
        console.log(`[HoursTracker] Sincronizado com Firebase: ${this.formatTime(this.drivingSeconds)}`);
      } catch (e) {
        console.error('[HoursTracker] Erro ao sincronizar:', e);
      }
    }
  }

  getStats() {
    const today = getLocalDateString();
    return {
      deviceId: this.deviceId,
      date: today,
      drivingHours: (this.drivingSeconds / 3600).toFixed(2),
      propagandaHours: (this.propagandaSeconds / 3600).toFixed(2),
      propagandaPercentage: this.drivingSeconds > 0 
        ? ((this.propagandaSeconds / this.drivingSeconds) * 100).toFixed(1)
        : '0',
      goalMet: (this.drivingSeconds / 3600) >= DAILY_GOAL_HOURS
    };
  }

  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  reset() {
    this.drivingSeconds = 0;
    this.propagandaSeconds = 0;
    this.isRunning = false;
    this.startTime = null;
    this.isPropagandaPlaying = false;
    this.saveState();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HoursTracker, HOURS_COLLECTION, ALERTS_COLLECTION, DAILY_GOAL_HOURS };
}

