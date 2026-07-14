/**
 * Minimal ambient types for the parts of the File System Access API this app
 * uses. The TypeScript version this project pins declares the older, read-
 * only `FileSystemFileHandle`/`FileSystemHandle` in its bundled lib.dom.d.ts,
 * but not the picker functions (`showOpenFilePicker`/`showSaveFilePicker`)
 * or the write extension (`createWritable`) - both Chromium-only and not
 * part of the stable spec those lib files track. See
 * FileSystemAccessStorage.ts, the one place these are used.
 */

interface FileSystemWritableFileStream extends WritableStream {
	write(data: FileSystemWriteChunkType): Promise<void>;
	close(): Promise<void>;
}

type FileSystemWriteChunkType = BufferSource | Blob | string;

interface FileSystemFileHandle {
	createWritable(options?: {
		keepExistingData?: boolean;
	}): Promise<FileSystemWritableFileStream>;
}

interface FilePickerAcceptType {
	description?: string;
	accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
	multiple?: boolean;
	excludeAcceptAllOption?: boolean;
	types?: FilePickerAcceptType[];
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	excludeAcceptAllOption?: boolean;
	types?: FilePickerAcceptType[];
}

interface Window {
	showOpenFilePicker?(
		options?: OpenFilePickerOptions
	): Promise<FileSystemFileHandle[]>;
	showSaveFilePicker?(
		options?: SaveFilePickerOptions
	): Promise<FileSystemFileHandle>;
}
