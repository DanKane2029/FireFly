import { Storage } from "./Storage";
import { FileSystemAccessStorage } from "./FileSystemAccessStorage";
import { OpfsStorage } from "./OpfsStorage";

/**
 * The only file that knows platforms exist. `App` takes a `Storage`;
 * `index.tsx` calls this to build the real one; tests inject `MemoryStorage`
 * directly instead (see docs/scene-creator-roadmap.md's storage-abstraction
 * section).
 *
 * Feature-detects - never sniffs the user agent - because the real question
 * is "does this browser have `showSaveFilePicker`", not "is this Chrome".
 */
export function createStorage(): Storage {
	if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
		return new FileSystemAccessStorage();
	}
	return new OpfsStorage();
}
