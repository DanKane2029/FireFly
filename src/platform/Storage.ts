/**
 * The storage abstraction: one narrow interface, several implementations
 * (see `index.ts`), so the rest of the app never has to know or care whether
 * it's running in Chrome, Firefox/Safari, or (eventually) Electron. See
 * docs/scene-creator-roadmap.md's "storage abstraction" section for the full
 * reasoning.
 *
 * Text I/O only for now (M4 - "Save/load working on the web"). Asset bytes
 * and recent-workspace tracking are the workspace milestone's job.
 */

/**
 * An opaque handle to a file the user picked. Never a path - the browser
 * implementation keeps a private map from this key to a real
 * `FileSystemFileHandle`/`File`; a path would leak the abstraction boundary
 * (and, in Electron, the `contextIsolation` security boundary) straight
 * through to callers.
 */
export interface FileRef {
	readonly key: string;
	readonly name: string;
}

/**
 * What this backend can actually do. The one honest leak in an otherwise
 * platform-blind interface: rather than `if (isElectron)` scattered through
 * the UI, callers read `capabilities.overwriteInPlace` to decide whether a
 * "Save" button silently overwrites the open file or has to re-prompt (and
 * effectively become a "Download") every time.
 */
export interface StorageCapabilities {
	/** Whether writeText(ref, ...) can silently overwrite the file `ref`
	 * points at. False on the download-based Firefox/Safari fallback - there
	 * every "save" is really a fresh download. */
	overwriteInPlace: boolean;
}

export interface PickOpenFileOptions {
	/** File extensions to filter the picker to, without the leading dot. */
	extensions: string[];
}

export interface PickSaveFileOptions {
	suggestedName: string;
	extensions: string[];
}

export interface Storage {
	readonly capabilities: StorageCapabilities;

	/** Prompts the user to pick a file to open. Resolves to null if they
	 * cancel - never rejects for a plain cancel. */
	pickOpenFile(options: PickOpenFileOptions): Promise<FileRef | null>;

	/** Prompts the user to pick where to save a new file. Resolves to null if
	 * they cancel. */
	pickSaveFile(options: PickSaveFileOptions): Promise<FileRef | null>;

	readText(ref: FileRef): Promise<string>;
	writeText(ref: FileRef, text: string): Promise<void>;
}
