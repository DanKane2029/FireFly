import { DirectoryEntry } from "./Storage";

/**
 * Reads and writes bytes at a workspace-relative path within a
 * `FileSystemDirectoryHandle` root, walking intermediate directories one
 * path segment at a time. Shared by FileSystemAccessStorage (a user-picked
 * folder) and OpfsStorage (the OPFS root) - both are rooted at a real
 * `FileSystemDirectoryHandle`, just picked up differently, so the actual
 * file I/O is identical.
 */

async function resolveDirectory(
	root: FileSystemDirectoryHandle,
	segments: string[],
	create: boolean
): Promise<FileSystemDirectoryHandle> {
	let dir = root;
	for (const segment of segments) {
		dir = await dir.getDirectoryHandle(segment, { create });
	}
	return dir;
}

function splitPath(relativePath: string): {
	directories: string[];
	fileName: string;
} {
	const segments = relativePath.split("/").filter(Boolean);
	const fileName = segments.pop();
	if (!fileName) {
		throw new Error(`Invalid relative path "${relativePath}".`);
	}
	return { directories: segments, fileName };
}

export async function readBytesFromDirectory(
	root: FileSystemDirectoryHandle,
	relativePath: string
): Promise<Uint8Array> {
	const { directories, fileName } = splitPath(relativePath);
	const dir = await resolveDirectory(root, directories, false);
	const fileHandle = await dir.getFileHandle(fileName);
	const file = await fileHandle.getFile();
	return new Uint8Array(await file.arrayBuffer());
}

export async function writeBytesToDirectory(
	root: FileSystemDirectoryHandle,
	relativePath: string,
	bytes: Uint8Array
): Promise<void> {
	const { directories, fileName } = splitPath(relativePath);
	const dir = await resolveDirectory(root, directories, true);
	const fileHandle = await dir.getFileHandle(fileName, { create: true });
	const writable = await fileHandle.createWritable();
	await writable.write(bytes);
	await writable.close();
}

/** Lists the direct children of a workspace-relative directory. Not
 * recursive - a caller wanting a subdirectory's contents calls this again
 * with that subdirectory's path. `relativePath: ""` lists `root` itself. */
export async function listDirectoryEntries(
	root: FileSystemDirectoryHandle,
	relativePath: string
): Promise<DirectoryEntry[]> {
	const segments = relativePath.split("/").filter(Boolean);
	const dir = await resolveDirectory(root, segments, false);

	const entries: DirectoryEntry[] = [];
	for await (const [name, handle] of dir.entries()) {
		if (handle.kind === "file") {
			const file = await handle.getFile();
			entries.push({ name, kind: "file", size: file.size });
		} else {
			entries.push({ name, kind: "directory" });
		}
	}
	return entries;
}
