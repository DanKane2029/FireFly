/**
 * The storage abstraction: one narrow interface, several implementations
 * (see `index.ts`), so the rest of the app never has to know or care whether
 * it's running in Chrome, Firefox/Safari, or (eventually) Electron. See
 * docs/scene-creator-roadmap.md's "storage abstraction" section for the full
 * reasoning.
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
 * An opaque handle to a workspace: a folder imported asset bytes are read
 * from and written to, relative to its root. Opaque for the same reason a
 * `FileRef` is - never a path.
 */
export interface WorkspaceRef {
	readonly key: string;
	readonly name: string;
}

/** A previously opened workspace, for a "recent workspaces" list. */
export interface RecentWorkspaceEntry {
	readonly workspace: WorkspaceRef;
	/** Epoch milliseconds, so a UI can sort/format it however it likes. */
	readonly lastOpened: number;
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
	/** Whether openWorkspace() shows a real folder-picker dialog. False on
	 * the OPFS backend, which has exactly one implicit workspace (the
	 * origin's private root) and nothing to pick between. */
	pickFolders: boolean;
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

	/** Opens a workspace: where `capabilities.pickFolders` is true, prompts
	 * the user to pick a folder; where it's false, resolves to the one
	 * implicit workspace this backend has. Resolves to null if the user
	 * cancels a folder picker. Also records the workspace in
	 * `recentWorkspaces()`. */
	openWorkspace(): Promise<WorkspaceRef | null>;

	/** Previously opened workspaces, most recently opened first. */
	recentWorkspaces(): Promise<RecentWorkspaceEntry[]>;

	/** Reads an asset's bytes from a workspace-relative path (e.g.
	 * "assets/4b7e-wood.png"). */
	readBytes(
		workspace: WorkspaceRef,
		relativePath: string
	): Promise<Uint8Array>;

	/** Writes an asset's bytes to a workspace-relative path, creating any
	 * intermediate directories the path names. */
	writeBytes(
		workspace: WorkspaceRef,
		relativePath: string,
		bytes: Uint8Array
	): Promise<void>;
}
