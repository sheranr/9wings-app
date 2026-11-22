// Firebase backend: Firestore (with offline cache) + email/password login.
import {
  initializeApp, deleteApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, writeBatch, runTransaction, terminate, clearIndexedDbPersistence
} from '../vendor/firebase.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

function clearLocalSession() {
  try { ['nw-me', 'nw-seen-notices', 'nw-notified-notices'].forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); } catch (e) { /* ignore */ }
}

export function create() {
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let fs;
  try {
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  } catch (e) {
    console.warn('offline cache unavailable, using memory', e);
    fs = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  }

  const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);

  return {
    kind: 'firebase',
    projectId: FIREBASE_CONFIG.projectId,

    subscribe(store, cb) {
      return onSnapshot(collection(fs, store), snap => {
        cb(snap.docChanges().map(c => ({ type: c.type, id: c.doc.id, data: { ...c.doc.data(), id: c.doc.id } })));
      }, err => { console.warn('listen failed', store, err.code); cb([]); });
    },
    // setDoc only resolves once the server confirms; offline it resolves later. Errors (e.g. permissions) reject.
    set: (store, rec) => setDoc(doc(fs, store, rec.id), rec),
    remove: (store, id) => deleteDoc(doc(fs, store, id)),

    async counter(key, localNext) {
      if (!navigator.onLine) throw new Error('offline');
      const ref = doc(fs, 'meta', 'counters');
      return withTimeout(runTransaction(fs, async tx => {
        const snap = await tx.get(ref);
        const cur = (snap.exists() && Number(snap.data()[key])) || 0;
        const n = Math.max(cur + 1, localNext);
        tx.set(ref, { [key]: n }, { merge: true });
        return n;
      }), 8000, localNext);
    },

    // ---------- auth & team ----------
    onAuth(cb) { return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); },
    signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
    // Sign out and remove the offline copy of the business data from this device.
    async signOut() {
      try { await signOut(auth); } catch (e) { console.warn(e); }
      try { await terminate(fs); await clearIndexedDbPersistence(fs); } catch (e) { console.warn('could not clear offline data', e); }
      clearLocalSession();
      location.reload();
    },
    resetPassword: email => sendPasswordResetEmail(auth, email),
    async changePassword(oldPw, newPw) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, oldPw));
      await updatePassword(u, newPw);
    },
    async ownerExists() {
      try { const s = await withTimeout(getDoc(doc(fs, 'meta', 'owner')), 8000, null); return s ? s.exists() : null; }
      catch (e) { return null; } // unknown (offline)
    },
    async member(uidv) {
      try { const s = await getDoc(doc(fs, 'members', uidv)); return s.exists() ? { ...s.data(), id: s.id } : null; }
      catch (e) { if (e.code === 'permission-denied') return null; throw e; }
    },
    // First account becomes the owner.
    // Set while the owner account is being created, so the app waits for the team record before checking access.
    ownerSetup: null,
    createOwner(name, email, pw) {
      this.ownerSetup = this._createOwner(name, email, pw);
      return this.ownerSetup.finally(() => { setTimeout(() => { this.ownerSetup = null; }, 3000); });
    },
    async _createOwner(name, email, pw) {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      const now = new Date().toISOString();
      const b = writeBatch(fs);
      b.set(doc(fs, 'meta', 'owner'), { uid: cred.user.uid, createdAt: now });
      b.set(doc(fs, 'members', cred.user.uid), { name, email, role: 'owner', active: true, createdAt: now, updatedAt: now });
      await b.commit();
      return cred.user.uid;
    },
    // Owner adds a staff login without being signed out (uses a separate, temporary Firebase app).
    async createStaff(name, email, pw, role = 'staff') {
      const tmp = initializeApp(FIREBASE_CONFIG, 'staff-' + Date.now());
      try {
        const tmpAuth = initializeAuth(tmp, { persistence: inMemoryPersistence });
        const cred = await createUserWithEmailAndPassword(tmpAuth, email, pw);
        const now = new Date().toISOString();
        await setDoc(doc(fs, 'members', cred.user.uid), { name, email, role, active: true, createdAt: now, updatedAt: now });
        await signOut(tmpAuth);
        return cred.user.uid;
      } finally { deleteApp(tmp).catch(() => {}); }
    }
  };
}
