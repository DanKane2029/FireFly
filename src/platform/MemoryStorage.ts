import {
	FileRef,
	PickSaveFileOptions,
	Storage,
	StorageCapabilities,
} from "./Storage";

/**
 * An in-memory Storage backend. Makes the whole persistence layer (App's
 * save/open flow, and anything built on top of it) unit-testable with zero
 * mocking - there is no real dialog for this backend to drive, so
 * `queueOpenPick` lets a test say what the "user" picks next, the same way a
 * real pickOpenFile call would resolve once they'd clicked a file.
 */
export class MemoryStorage implements Storage {
	readonly capabilities: StorageCapabilities = {
		overwriteInPlace: true,
	};

	private _files = new Map<string, string>(); // key -> text
	private _names = new Map<string, string>(); // key -> display name
	private _nextKey = 1;
	private _queuedOpenPick: FileRef | null | undefined = undefined;

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
}
