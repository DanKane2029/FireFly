import {
	FileRef,
	PickSaveFileOptions,
	RecentWorkspaceEntry,
	Storage,
	StorageCapabilities,
	WorkspaceRef,
} from "./Storage";

/**
 * An in-memory Storage backend. Makes the whole persistence layer (App's
 * save/open flow, and anything built on top of it) unit-testable with zero
 * mocking - there is no real dialog for this backend to drive, so
 * `queueOpenPick`/`queueWorkspacePick` let a test say what the "user" picks
 * next, the same way a real pickOpenFile/openWorkspace call would resolve
 * once they'd clicked a file or folder.
 */
export class MemoryStorage implements Storage {
	readonly capabilities: StorageCapabilities = {
		overwriteInPlace: true,
		pickFolders: true,
	};

	private _files = new Map<string, string>(); // key -> text
	private _names = new Map<string, string>(); // key -> display name
	private _nextKey = 1;
	private _queuedOpenPick: FileRef | null | undefined = undefined;

	private _workspaceFiles = new Map<string, Map<string, Uint8Array>>(); // workspace key -> (relative path -> bytes)
	private _recents: RecentWorkspaceEntry[] = [];
	private _nextWorkspaceKey = 1;
	private _queuedWorkspacePick: WorkspaceRef | null | undefined = undefined;

	/**
	 * Test-only: makes the next `pickOpenFile()` call resolve to `ref`
	 * (or null, simulating the user cancelling) instead of the default
	 * "most recently written file" behavior.
	 */
	queueOpenPick(ref: FileRef | null): void {
		this._queuedOpenPick = ref;
	}

	// Doesn't filter by extension - there's no real picker UI to filter, and
	// queueOpenPick already lets a test say exactly what should come back.
	async pickOpenFile(): Promise<FileRef | null> {
		if (this._queuedOpenPick !== undefined) {
			const ref = this._queuedOpenPick;
			this._queuedOpenPick = undefined;
			return ref;
		}
		const lastKey = Array.from(this._files.keys()).pop();
		if (!lastKey) {
			return null;
		}
		return { key: lastKey, name: this._names.get(lastKey) ?? lastKey };
	}

	async pickSaveFile(options: PickSaveFileOptions): Promise<FileRef | null> {
		const key = `mem/${this._nextKey++}`;
		this._names.set(key, options.suggestedName);
		return { key, name: options.suggestedName };
	}

	async readText(ref: FileRef): Promise<string> {
		const text = this._files.get(ref.key);
		if (text === undefined) {
			throw new Error(`No file at "${ref.key}".`);
		}
		return text;
	}

	async writeText(ref: FileRef, text: string): Promise<void> {
		this._files.set(ref.key, text);
		this._names.set(ref.key, ref.name);
	}

	/**
	 * Test-only: makes the next `openWorkspace()` call resolve to `ref`
	 * (or null, simulating the user cancelling) instead of minting a fresh
	 * workspace.
	 */
	queueWorkspacePick(ref: WorkspaceRef | null): void {
		this._queuedWorkspacePick = ref;
	}

	async openWorkspace(): Promise<WorkspaceRef | null> {
		if (this._queuedWorkspacePick !== undefined) {
			const ref = this._queuedWorkspacePick;
			this._queuedWorkspacePick = undefined;
			if (ref) {
				this.touchRecent(ref);
			}
			return ref;
		}
		const key = `mem-ws/${this._nextWorkspaceKey}`;
		const ref: WorkspaceRef = {
			key,
			name: `workspace-${this._nextWorkspaceKey}`,
		};
		this._nextWorkspaceKey++;
		this._workspaceFiles.set(key, new Map());
		this.touchRecent(ref);
		return ref;
	}

	async recentWorkspaces(): Promise<RecentWorkspaceEntry[]> {
		// _recents is already maintained oldest-touched-first (see touchRecent),
		// so reversing it is the ordering - sorting by `lastOpened` instead
		// would be wrong for tests that open two workspaces in the same
		// millisecond, which Date.now() can't tell apart.
		return [...this._recents].reverse();
	}

	async readBytes(
		workspace: WorkspaceRef,
		relativePath: string
	): Promise<Uint8Array> {
		const bytes = this._workspaceFiles
			.get(workspace.key)
			?.get(relativePath);
		if (!bytes) {
			throw new Error(
				`No file at "${relativePath}" in workspace "${workspace.name}".`
			);
		}
		return bytes;
	}

	async writeBytes(
		workspace: WorkspaceRef,
		relativePath: string,
		bytes: Uint8Array
	): Promise<void> {
		let files = this._workspaceFiles.get(workspace.key);
		if (!files) {
			files = new Map();
			this._workspaceFiles.set(workspace.key, files);
		}
		files.set(relativePath, bytes);
	}

	private touchRecent(workspace: WorkspaceRef): void {
		this._recents = this._recents.filter(
			(entry) => entry.workspace.key !== workspace.key
		);
		this._recents.push({ workspace, lastOpened: Date.now() });
	}
}
