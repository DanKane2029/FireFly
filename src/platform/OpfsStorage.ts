import {
	FileRef,
	PickOpenFileOptions,
	PickSaveFileOptions,
	Storage,
	StorageCapabilities,
} from "./Storage";

/**
 * The Firefox/Safari fallback: neither ships the File System Access API
 * (see FileSystemAccessStorage), so "Open" is a plain `<input type=file>`
 * and "Save" is a Blob download - there is no real handle to write back to,
 * so every save re-downloads rather than overwriting in place.
 *
 * Named for where this is going, not just what M4 needs: once the workspace
 * milestone adds imported asset bytes, this backend is what gives them a
 * real home via the Origin Private File System, keeping the web build
 * genuinely functional (not just a degraded demo) on non-Chromium browsers.
 * For now - text-only save/open - it doesn't touch OPFS at all.
 */
export class OpfsStorage implements Storage {
	readonly capabilities: StorageCapabilities = {
		overwriteInPlace: false,
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
		const file = this._uploadedFiles.get(ref.key);
		if (!file) {
			throw new Error(`No uploaded file for "${ref.key}".`);
		}
		return file.text();
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
}
