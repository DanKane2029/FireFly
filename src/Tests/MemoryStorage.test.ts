import { describe, expect, test } from "@jest/globals";
import { MemoryStorage } from "../platform/MemoryStorage";
import { FileRef } from "../platform/Storage";

/** MemoryStorage's pickSaveFile never actually returns null (there's no real
 * dialog to cancel) - this just gives the tests a non-nullable ref to work
 * with without a `!` on every call. */
function must(ref: FileRef | null): FileRef {
	if (!ref) {
		throw new Error("Expected a FileRef, got null.");
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
});
