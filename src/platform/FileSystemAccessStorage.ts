import {
	FileRef,
	PickOpenFileOptions,
	PickSaveFileOptions,
	Storage,
	StorageCapabilities,
} from "./Storage";

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
	};

	// FileRef.key must be opaque, never a path (see Storage.ts) - and a
	// FileSystemFileHandle isn't a plain string to begin with, so keep a
	// private map from a minted key to the real handle. That means a FileRef
	// only stays valid for the lifetime of this Storage instance; surviving a
	// reload needs the handle persisted in IndexedDB, which is the workspace
	// milestone's job ("recent workspaces").
	private _handles = new Map<string, FileSystemFileHandle>();
	private _nextKey = 1;

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
}
