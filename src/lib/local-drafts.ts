const DB = "curio-drafts";
async function store() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function writeDraft(key: string, value: unknown) {
  const db = await store();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function readDraft<T>(key: string) {
  const db = await store();
  return new Promise<T | undefined>((resolve, reject) => {
    const r = db.transaction("drafts").objectStore("drafts").get(key);
    r.onsuccess = () => {
      db.close();
      resolve(r.result as T | undefined);
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
export async function removeDraft(key: string) {
  const db = await store();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAccountDrafts(userId: string) {
  const db = await store();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const cursor = tx.objectStore("drafts").openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        if (String(c.key).startsWith(`${userId}:`)) c.delete();
        c.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
