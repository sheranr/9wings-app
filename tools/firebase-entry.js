// Bundled into www/vendor/firebase.js so the app works offline (no CDN needed).
// Rebuild: npm install firebase esbuild && npx esbuild tools/firebase-entry.js --bundle --format=esm --minify --outfile=www/vendor/firebase.js
export { initializeApp, deleteApp } from 'firebase/app';
export {
  initializeAuth, getAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential, connectAuthEmulator
} from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch, runTransaction,
  serverTimestamp, connectFirestoreEmulator, getDocFromServer, waitForPendingWrites
} from 'firebase/firestore';
