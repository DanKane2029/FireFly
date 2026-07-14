/**
 * Persists `FileSystemDirectoryHandle`s across reloads for FileSystemAccessStorage's
 * "recent workspaces" list. `FileSystemFileHandle`/`FileSystemDirectoryHandle`
 * are structured-cloneable, so IndexedDB (unlike localStorage, which only
 * stores strings) can hold the real handle directly - reopening a recent
 * workspace needs no picker dialog, just a permission re-grant prompt the
 * browser shows automatically on first use after a reload.
 *
 * Only FileSystemAccessStorage uses this. OpfsStorage has exactly one
 * implicit workspace (the OPFS root) with nothing to persist a handle for.
 */

const DB_NAME = "firefly-workspaces";
const STORE_NAME = "recents";
const DB_VERSION = 1;

interface StoredRecent {
	key: string;
	name: string;
	handle: FileSystemDirectoryHandle;
	lastOpened: number;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/** Records (or updates) a workspace handle as most-recently-opened. */
export async function putRecentWorkspaceHandle(
	entry: StoredRecent
): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		tx.objectStore(STORE_NAME).put(entry);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

/** All recorded workspace handles, in no particular order - sort by
 * `lastOpened` at the call site. */
export async function getRecentWorkspaceHandles(): Promise<StoredRecent[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const request = tx.objectStore(STORE_NAME).getAll();
		request.onsuccess = () => resolve(request.result as StoredRecent[]);
		request.onerror = () => reject(request.error);
	});
}

/** Looks up a single recorded handle by its key. */
export async function getRecentWorkspaceHandle(
	key: string
): Promise<StoredRecent | undefined> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const request = tx.objectStore(STORE_NAME).get(key);
		request.onsuccess = () =>
			resolve(request.result as StoredRecent | undefined);
		request.onerror = () => reject(request.error);
	});
}
