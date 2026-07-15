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

/**
 * The Firefox/Safari fallback: neither ships the File System Access API
 * (see FileSystemAccessStorage), so scene "Open" is a plain
 * `<input type=file>` and "Save" is a Blob download - there is no real
 * handle to write back to, so every save re-downloads rather than
 * overwriting in place.
 *
 * Asset bytes are different: those go through the Origin Private File
 * System (`navigator.storage.getDirectory()`), which both browsers do ship,
 * so imported assets still get a real, persistent home here - keeping the
 * web build genuinely functional (not just a degraded demo) on non-Chromium
 * browsers. There is exactly one implicit workspace (the OPFS root); unlike
 * FileSystemAccessStorage there is nothing to pick between, so
 * `capabilities.pickFolders` is false and `openWorkspace()` never prompts.
 */
export class OpfsStorage implements Storage {
	readonly capabilities: StorageCapabilities = {
		overwriteInPlace: false,
		pickFolders: false,
	};

	private static readonly ROOT_WORKSPACE: WorkspaceRef = {
		key: "opfs-root",
		name: "Browser storage",
	};

	private _uploadedFiles = new Map<string, File>();

	async pickOpenFile(options: PickOpenFileOptions): Promise<FileRef | null> {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = options.extensions.map((ext) => `.${ext}`).join(",");
			input.onchange = () => {
				const file = input.files?.[0];
				resolve(file ? this.registerUpload(file) : null);
			};
			input.click();
		});
	}

	async pickSaveFile(options: PickSaveFileOptions): Promise<FileRef | null> {
		// There is no real save location to pick here - writeText is what
		// actually triggers the download. This just remembers the name the
		// user asked to save as.
		return {
			key: `download/${options.suggestedName}`,
			name: options.suggestedName,
		};
	}

	async readText(ref: FileRef): Promise<string> {
		return this.requireUploadedFile(ref).text();
	}

	async readFileBytes(ref: FileRef): Promise<Uint8Array> {
		return new Uint8Array(
			await this.requireUploadedFile(ref).arrayBuffer()
		);
	}

	private requireUploadedFile(ref: FileRef): File {
		const file = this._uploadedFiles.get(ref.key);
		if (!file) {
			throw new Error(`No uploaded file for "${ref.key}".`);
		}
		return file;
	}

	async writeText(ref: FileRef, text: string): Promise<void> {
		const blob = new Blob([text], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		try {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = ref.name;
			anchor.click();
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	private registerUpload(file: File): FileRef {
		const key = `upload/${file.name}`;
		this._uploadedFiles.set(key, file);
		return { key, name: file.name };
	}

	private _lastOpened: number | null = null;

	async openWorkspace(): Promise<WorkspaceRef | null> {
		this._lastOpened = Date.now();
		return OpfsStorage.ROOT_WORKSPACE;
	}

	async recentWorkspaces(): Promise<RecentWorkspaceEntry[]> {
		if (this._lastOpened === null) {
			return [];
		}
		return [
			{
				workspace: OpfsStorage.ROOT_WORKSPACE,
				lastOpened: this._lastOpened,
			},
		];
	}

	// `workspace` isn't consulted - there's exactly one (the OPFS root), so
	// every WorkspaceRef this backend ever hands out already refers to it.
	async readBytes(
		_workspace: WorkspaceRef,
		relativePath: string
	): Promise<Uint8Array> {
		return readBytesFromDirectory(
			await navigator.storage.getDirectory(),
			relativePath
		);
	}

	async writeBytes(
		_workspace: WorkspaceRef,
		relativePath: string,
		bytes: Uint8Array
	): Promise<void> {
		await writeBytesToDirectory(
			await navigator.storage.getDirectory(),
			relativePath,
			bytes
		);
	}

	async listDirectory(
		_workspace: WorkspaceRef,
		relativePath: string
	): Promise<DirectoryEntry[]> {
		return listDirectoryEntries(
			await navigator.storage.getDirectory(),
			relativePath
		);
	}
}
