// Device-only backend (IndexedDB). Used until Firebase is configured, and for testing.
const DB_NAME = 'ninewings-device';
const STORES = ['customers', 'events', 'invoices', 'items', 'packages', 'expenses', 'offers', 'settings', 'members', 'meta'];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function create() {
  const db = await openDb();
  const op = (store, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
  return {
    kind: 'device',
    subscribe(store, cb) {
      op(store, 'readonly', s => s.getAll()).then(list => cb((list || []).map(d => ({ type: 'added', id: d.id, data: d }))));
      return () => {};
    },
    set: (store, rec) => op(store, 'readwrite', s => s.put(rec)),
    remove: (store, id) => op(store, 'readwrite', s => s.delete(id)),
    async counter(key, localNext) {
      const c = (await op('meta', 'readonly', s => s.get('counters'))) || { id: 'counters' };
      const n = Math.max((Number(c[key]) || 0) + 1, localNext);
      c[key] = n;
      await op('meta', 'readwrite', s => s.put(c));
      return n;
    },
    // No login on a single device: the device user is the owner.
    onAuth(cb) { setTimeout(() => cb({ uid: 'device', email: '' }), 0); return () => {}; },
    signIn: async () => {}, signOut: async () => {}, resetPassword: async () => {},
    changePassword: async () => { throw new Error('Passwords are only used with the online database.'); },
    ownerExists: async () => true,
    member: async () => ({ id: 'device', name: 'Owner', role: 'owner', active: true }),
    createOwner: async () => 'device',
    createStaff: async () => { throw new Error('Staff logins need the online database (Firebase).'); }
  };
}
