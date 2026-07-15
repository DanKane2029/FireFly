import { describe, expect, test } from "@jest/globals";
import { MemoryStorage } from "../platform/MemoryStorage";

/** MemoryStorage's pickSaveFile/openWorkspace never actually return null
 * (there's no real dialog to cancel) - this just gives the tests a
 * non-nullable ref to work with without a `!` on every call. */
function must<T>(ref: T | null): T {
	if (!ref) {
		throw new Error("Expected a non-null ref, got null.");
	}
	return ref;
}

describe("MemoryStorage", () => {
	test("write then read round-trips text", async () => {
		const storage = new MemoryStorage();
		const ref = must(
			await storage.pickSaveFile({
				suggestedName: "scene.ffscene",
				extensions: ["ffscene"],
			})
		);

		await storage.writeText(ref, '{"hello":"world"}');
		expect(await storage.readText(ref)).toBe('{"hello":"world"}');
	});

	test("readText throws for a ref nothing was ever written to", async () => {
		const storage = new MemoryStorage();
		await expect(
			storage.readText({ key: "mem/999", name: "missing.ffscene" })
		).rejects.toThrow(/No file at/);
	});

	test("pickOpenFile defaults to the most recently written file", async () => {
		const storage = new MemoryStorage();
		const first = must(
			await storage.pickSaveFile({
				suggestedName: "first.ffscene",
				extensions: ["ffscene"],
			})
		);
		await storage.writeText(first, "first");
		const second = must(
			await storage.pickSaveFile({
				suggestedName: "second.ffscene",
				extensions: ["ffscene"],
			})
		);
		await storage.writeText(second, "second");

		const picked = must(await storage.pickOpenFile());
		expect(picked.name).toBe("second.ffscene");
		expect(await storage.readText(picked)).toBe("second");
	});

	test("pickOpenFile resolves to null when nothing has been saved", async () => {
		const storage = new MemoryStorage();
		expect(await storage.pickOpenFile()).toBeNull();
	});

	test("queueOpenPick overrides the default pick once, then reverts", async () => {
		const storage = new MemoryStorage();
		const ref = must(
			await storage.pickSaveFile({
				suggestedName: "scene.ffscene",
				extensions: ["ffscene"],
			})
		);
		await storage.writeText(ref, "content");

		storage.queueOpenPick(null); // simulate the user cancelling
		expect(await storage.pickOpenFile()).toBeNull();

		// The queued pick was consumed - the next call falls back to default
		// behavior again.
		const picked = must(await storage.pickOpenFile());
		expect(picked.name).toBe("scene.ffscene");
	});

	test("capabilities.overwriteInPlace is true", () => {
		const storage = new MemoryStorage();
		expect(storage.capabilities.overwriteInPlace).toBe(true);
	});

	test("writing to the same ref twice overwrites, not appends", async () => {
		const storage = new MemoryStorage();
		const ref = must(
			await storage.pickSaveFile({
				suggestedName: "scene.ffscene",
				extensions: ["ffscene"],
			})
		);
		await storage.writeText(ref, "v1");
		await storage.writeText(ref, "v2");
		expect(await storage.readText(ref)).toBe("v2");
	});

	test("capabilities.pickFolders is true", () => {
		const storage = new MemoryStorage();
		expect(storage.capabilities.pickFolders).toBe(true);
	});

	test("openWorkspace mints a fresh workspace each call by default", async () => {
		const storage = new MemoryStorage();
		const a = must(await storage.openWorkspace());
		const b = must(await storage.openWorkspace());
		expect(a.key).not.toBe(b.key);
	});

	test("writeBytes then readBytes round-trips within a workspace", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		const bytes = new Uint8Array([1, 2, 3, 4]);

		await storage.writeBytes(workspace, "assets/thing.bin", bytes);
		expect(await storage.readBytes(workspace, "assets/thing.bin")).toEqual(
			bytes
		);
	});

	test("readBytes throws for a path nothing was written to", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		await expect(
			storage.readBytes(workspace, "assets/missing.bin")
		).rejects.toThrow(/No file at/);
	});

	test("bytes written to one workspace aren't visible from another", async () => {
		const storage = new MemoryStorage();
		const a = must(await storage.openWorkspace());
		const b = must(await storage.openWorkspace());

		await storage.writeBytes(a, "assets/thing.bin", new Uint8Array([9]));
		await expect(storage.readBytes(b, "assets/thing.bin")).rejects.toThrow(
			/No file at/
		);
	});

	test("recentWorkspaces lists opened workspaces, most recent first", async () => {
		const storage = new MemoryStorage();
		const first = must(await storage.openWorkspace());
		const second = must(await storage.openWorkspace());

		const recents = await storage.recentWorkspaces();
		expect(recents.map((r) => r.workspace.key)).toEqual([
			second.key,
			first.key,
		]);
	});

	test("reopening a workspace moves it to the front of recentWorkspaces", async () => {
		const storage = new MemoryStorage();
		const first = must(await storage.openWorkspace());
		const second = must(await storage.openWorkspace());

		storage.queueWorkspacePick(first);
		await storage.openWorkspace();

		const recents = await storage.recentWorkspaces();
		expect(recents.map((r) => r.workspace.key)).toEqual([
			first.key,
			second.key,
		]);
	});

	test("queueWorkspacePick(null) simulates the user cancelling the picker", async () => {
		const storage = new MemoryStorage();
		storage.queueWorkspacePick(null);
		expect(await storage.openWorkspace()).toBeNull();
	});

	test("listDirectory on an empty workspace returns []", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		expect(await storage.listDirectory(workspace, "")).toEqual([]);
	});

	test("listDirectory lists a root-level file", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		await storage.writeBytes(
			workspace,
			"thing.bin",
			new Uint8Array([1, 2, 3])
		);

		expect(await storage.listDirectory(workspace, "")).toEqual([
			{ name: "thing.bin", kind: "file", size: 3 },
		]);
	});

	test("listDirectory groups a nested path into one directory entry at the root", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		await storage.writeBytes(
			workspace,
			"assets/sub/thing.bin",
			new Uint8Array([1, 2, 3, 4])
		);

		expect(await storage.listDirectory(workspace, "")).toEqual([
			{ name: "assets", kind: "directory" },
		]);
	});

	test("listDirectory drills into a subdirectory", async () => {
		const storage = new MemoryStorage();
		const workspace = must(await storage.openWorkspace());
		await storage.writeBytes(
			workspace,
			"assets/sub/thing.bin",
			new Uint8Array([1, 2, 3, 4])
		);

		expect(await storage.listDirectory(workspace, "assets")).toEqual([
			{ name: "sub", kind: "directory" },
		]);
		expect(await storage.listDirectory(workspace, "assets/sub")).toEqual([
			{ name: "thing.bin", kind: "file", size: 4 },
		]);
	});

	test("listDirectory on a workspace nothing was ever written to returns []", async () => {
		const storage = new MemoryStorage();
		expect(
			await storage.listDirectory({ key: "mem-ws/999", name: "gone" }, "")
		).toEqual([]);
	});
});
