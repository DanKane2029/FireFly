import {
	DirectoryEntry,
	FileRef,
	PickOpenFileOptions,
	PickSaveFileOptions,
	RecentWorkspaceEntry,
	Storage,
	StorageCapabilities,
	WorkspaceRef,
} from "./Storage";
import {
	listDirectoryEntries,
	readBytesFromDirectory,
	writeBytesToDirectory,
} from "./directoryHandle";
import {
	getRecentWorkspaceHandle,
	getRecentWorkspaceHandles,
	putRecentWorkspaceHandle,
} from "./workspaceHandleDb";

function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === "AbortError";
}

function acceptType(extensions: string[]): FilePickerAcceptType {
	return {
		description: "Firefly scene",
		accept: { "application/json": extensions.map((ext) => `.${ext}`) },
	};
}

/**
 * The real Open/Save dialogs, via the File System Access API - Chromium
 * only (Chrome/Edge). See docs/scene-creator-roadmap.md: Firefox and Safari
 * never shipped this API and Mozilla formally called local-disk pickers
 * harmful, hence the separate OpfsStorage fallback.
 */
export class FileSystemAccessStorage implements Storage {
	readonly capabilities: StorageCapabilities = {
		overwriteInPlace: true,
		pickFolders: true,
	};

	// FileRef.key must be opaque, never a path (see Storage.ts) - and a
	// FileSystemFileHandle isn't a plain string to begin with, so keep a
	// private map from a minted key to the real handle. That means a FileRef
	// only stays valid for the lifetime of this Storage instance - unlike a
	// WorkspaceRef (below), an individual open/save file handle is never
	// persisted, since there's no "recent files" feature, only "recent
	// workspaces".
	private _handles = new Map<string, FileSystemFileHandle>();
	private _nextKey = 1;

	// Workspace handles ARE persisted (see workspaceHandleDb.ts), so a
	// WorkspaceRef's key is stable across reloads - it's what's stored in
	// IndexedDB, not minted fresh per session like _handles above.
	private _workspaceHandles = new Map<string, FileSystemDirectoryHandle>();
	private _nextWorkspaceKey = 1;

	async pickOpenFile(options: PickOpenFileOptions): Promise<FileRef | null> {
		const showOpenFilePicker = this.requireShowOpenFilePicker();
		try {
			const [handle] = await showOpenFilePicker({
				multiple: false,
				types: [acceptType(options.extensions)],
			});
			return this.registerHandle(handle);
		} catch (err) {
			if (isAbortError(err)) {
				return null;
			}
			throw err;
		}
	}

	async pickSaveFile(options: PickSaveFileOptions): Promise<FileRef | null> {
		const showSaveFilePicker = this.requireShowSaveFilePicker();
		try {
			const handle = await showSaveFilePicker({
				suggestedName: options.suggestedName,
				types: [acceptType(options.extensions)],
			});
			return this.registerHandle(handle);
		} catch (err) {
			if (isAbortError(err)) {
				return null;
			}
			throw err;
		}
	}

	async readText(ref: FileRef): Promise<string> {
		const file = await this.resolveHandle(ref).getFile();
		return file.text();
	}

	async writeText(ref: FileRef, text: string): Promise<void> {
		const writable = await this.resolveHandle(ref).createWritable();
		await writable.write(text);
		await writable.close();
	}

	async readFileBytes(ref: FileRef): Promise<Uint8Array> {
		const file = await this.resolveHandle(ref).getFile();
		return new Uint8Array(await file.arrayBuffer());
	}

	async openWorkspace(): Promise<WorkspaceRef | null> {
		const showDirectoryPicker = this.requireShowDirectoryPicker();
		let handle: FileSystemDirectoryHandle;
		try {
			handle = await showDirectoryPicker({ mode: "readwrite" });
		} catch (err) {
			if (isAbortError(err)) {
				return null;
			}
			throw err;
		}

		const key = `fsa-ws/${this._nextWorkspaceKey++}`;
		this._workspaceHandles.set(key, handle);
		const ref: WorkspaceRef = { key, name: handle.name };

		// Persisting to IndexedDB is what lets this workspace show up in
		// recentWorkspaces() after a reload - genuinely useful, but not
		// something a failure here (quota, private browsing blocking
		// IndexedDB, ...) should be allowed to undo. The workspace was
		// already opened successfully for *this* session; only "remembering
		// it for next time" is best-effort.
		try {
			await putRecentWorkspaceHandle({
				key,
				name: handle.name,
				handle,
				lastOpened: Date.now(),
			});
		} catch (err) {
			console.error(
				`Opened workspace "${handle.name}", but failed to remember it for recentWorkspaces().`,
				err
			);
		}

		return ref;
	}

	async recentWorkspaces(): Promise<RecentWorkspaceEntry[]> {
		const stored = await getRecentWorkspaceHandles();
		return stored
			.map((entry) => ({
				workspace: { key: entry.key, name: entry.name },
				lastOpened: entry.lastOpened,
			}))
			.sort((a, b) => b.lastOpened - a.lastOpened);
	}

	async readBytes(
		workspace: WorkspaceRef,
		relativePath: string
	): Promise<Uint8Array> {
		return readBytesFromDirectory(
			await this.resolveWorkspaceHandle(workspace),
			relativePath
		);
	}

	async writeBytes(
		workspace: WorkspaceRef,
		relativePath: string,
		bytes: Uint8Array
	): Promise<void> {
		await writeBytesToDirectory(
			await this.resolveWorkspaceHandle(workspace),
			relativePath,
			bytes
		);
	}

	async listDirectory(
		workspace: WorkspaceRef,
		relativePath: string
	): Promise<DirectoryEntry[]> {
		return listDirectoryEntries(
			await this.resolveWorkspaceHandle(workspace),
			relativePath
		);
	}

	/**
	 * Resolves a WorkspaceRef to its live directory handle. Falls back to
	 * IndexedDB (and caches the result) when the ref names a workspace that
	 * was opened in a *previous* session - reopening a recent workspace after
	 * a reload must work without re-prompting a picker dialog, which is the
	 * entire point of persisting the handle in the first place.
	 */
	private async resolveWorkspaceHandle(
		workspace: WorkspaceRef
	): Promise<FileSystemDirectoryHandle> {
		const cached = this._workspaceHandles.get(workspace.key);
		if (cached) {
			return cached;
		}
		const stored = await getRecentWorkspaceHandle(workspace.key);
		if (!stored) {
			throw new Error(
				`No workspace handle for "${workspace.key}" - it was never opened this session and isn't in the recent-workspaces list.`
			);
		}
		this._workspaceHandles.set(workspace.key, stored.handle);
		return stored.handle;
	}

	private registerHandle(handle: FileSystemFileHandle): FileRef {
		const key = `fsa/${this._nextKey++}`;
		this._handles.set(key, handle);
		return { key, name: handle.name };
	}

	private resolveHandle(ref: FileRef): FileSystemFileHandle {
		const handle = this._handles.get(ref.key);
		if (!handle) {
			throw new Error(
				`No open file handle for "${ref.key}" - handles don't survive a reload yet (that needs IndexedDB persistence, see the roadmap's workspace milestone).`
			);
		}
		return handle;
	}

	// createStorage() only constructs this class once it has already confirmed
	// showOpenFilePicker/showSaveFilePicker exist (see platform/index.ts), so
	// these should never actually throw - they exist to turn "silently
	// undefined" into a clear, named failure if that invariant is ever broken,
	// the same way Renderer.assertCreated does for a lost GL context.
	private requireShowOpenFilePicker(): NonNullable<
		Window["showOpenFilePicker"]
	> {
		if (!window.showOpenFilePicker) {
			throw new Error(
				"showOpenFilePicker is not available in this browser."
			);
		}
		return window.showOpenFilePicker;
	}

	private requireShowSaveFilePicker(): NonNullable<
		Window["showSaveFilePicker"]
	> {
		if (!window.showSaveFilePicker) {
			throw new Error(
				"showSaveFilePicker is not available in this browser."
			);
		}
		return window.showSaveFilePicker;
	}

	private requireShowDirectoryPicker(): NonNullable<
		Window["showDirectoryPicker"]
	> {
		if (!window.showDirectoryPicker) {
			throw new Error(
				"showDirectoryPicker is not available in this browser."
			);
		}
		return window.showDirectoryPicker;
	}
}
