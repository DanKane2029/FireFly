import { describe, expect, test } from "@jest/globals";
import { AssetRegistry } from "../Assets/AssetRegistry";
import { Sphere } from "../Geometry/Sphere";
import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { MaterialPropertyType } from "../Renderer/Material";
import { Renderer } from "../Renderer/Renderer";

function stubProgram(): ShaderProgram {
	return new ShaderProgram(
		new Shader("// vertex", ShaderType.VERTEX),
		new Shader("// fragment", ShaderType.FRAGMENT)
	);
}

/**
 * Records which GPU delete calls the registry made, without needing a real GL
 * context - mirrors the Renderer stub in ecs.test.ts.
 */
function stubRenderer() {
	const deleted: { vertexBuffers: unknown[]; indexBuffers: unknown[] } = {
		vertexBuffers: [],
		indexBuffers: [],
	};
	const renderer = {
		deleteVertexBuffer: (buffer: unknown) =>
			deleted.vertexBuffers.push(buffer),
		deleteIndexBuffer: (buffer: unknown) =>
			deleted.indexBuffers.push(buffer),
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		deleteTexture: () => {},
	} as unknown as Renderer;
	return { renderer, deleted };
}

describe("AssetRegistry meshes", () => {
	test("registers and resolves a mesh by id", () => {
		const registry = new AssetRegistry();
		const mesh = new Sphere(1).calculateMesh(4);
		registry.registerMesh(
			"mesh/sphere",
			{ kind: "primitive", primitive: "sphere" },
			mesh
		);

		expect(registry.resolveMesh("mesh/sphere")).toBe(mesh);
		expect(registry.meshDescriptor("mesh/sphere")).toEqual({
			kind: "primitive",
			primitive: "sphere",
		});
	});

	test("throws registering the same id twice", () => {
		const registry = new AssetRegistry();
		const mesh = new Sphere(1).calculateMesh(4);
		registry.registerMesh(
			"mesh/sphere",
			{ kind: "primitive", primitive: "sphere" },
			mesh
		);

		expect(() =>
			registry.registerMesh(
				"mesh/sphere",
				{ kind: "primitive", primitive: "sphere" },
				mesh
			)
		).toThrow(/already registered/);
	});

	test("throws resolving an unregistered mesh id", () => {
		const registry = new AssetRegistry();
		expect(() => registry.resolveMesh("mesh/missing")).toThrow(
			/No mesh registered/
		);
	});

	test("disposeMesh frees GPU buffers and drops the entry", () => {
		const registry = new AssetRegistry();
		const mesh = new Sphere(1).calculateMesh(4);
		registry.registerMesh(
			"mesh/sphere",
			{ kind: "primitive", primitive: "sphere" },
			mesh
		);

		const { renderer, deleted } = stubRenderer();
		registry.disposeMesh(renderer, "mesh/sphere");

		expect(deleted.vertexBuffers).toEqual([mesh.vertexBuffer]);
		expect(deleted.indexBuffers).toEqual([mesh.indexBuffer]);
		expect(() => registry.resolveMesh("mesh/sphere")).toThrow(
			/No mesh registered/
		);
	});

	test("disposeMesh with no renderer still drops the entry, without touching the GPU", () => {
		const registry = new AssetRegistry();
		const mesh = new Sphere(1).calculateMesh(4);
		registry.registerMesh(
			"mesh/sphere",
			{ kind: "primitive", primitive: "sphere" },
			mesh
		);

		registry.disposeMesh(undefined, "mesh/sphere");
		expect(() => registry.resolveMesh("mesh/sphere")).toThrow(
			/No mesh registered/
		);
	});
});

describe("AssetRegistry materials", () => {
	test("mints a fresh id per call, even with identical properties", () => {
		const registry = new AssetRegistry();
		const program = stubProgram();
		const a = registry.createMaterial("Ball", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);
		const b = registry.createMaterial("Ball", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);

		expect(a).not.toBe(b);
		expect(registry.resolveMaterial(a)).not.toBe(
			registry.resolveMaterial(b)
		);
	});

	test("setMaterialProperty updates both the live object and the descriptor", () => {
		const registry = new AssetRegistry();
		const id = registry.createMaterial("Ball", stubProgram(), [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);

		registry.setMaterialProperty(id, "u_color", [0, 1, 0, 1]);

		const live = registry.resolveMaterial(id);
		const liveColor = live.properties.find((p) => p.name === "u_color");
		expect(liveColor?.value).toEqual([0, 1, 0, 1]);

		const descriptor = registry.materialDescriptor(id);
		const descriptorColor = descriptor.properties.find(
			(p) => p.name === "u_color"
		);
		expect(descriptorColor?.value).toEqual([0, 1, 0, 1]);
	});

	test("editing one entity's material does not affect another's, even with the same starting color", () => {
		const registry = new AssetRegistry();
		const program = stubProgram();
		const a = registry.createMaterial("Ball A", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);
		const b = registry.createMaterial("Ball B", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);

		registry.setMaterialProperty(a, "u_color", [0, 0, 1, 1]);

		const bColor = registry
			.resolveMaterial(b)
			.properties.find((p) => p.name === "u_color");
		expect(bColor?.value).toEqual([1, 0, 0, 1]);
	});

	test("restoreMaterial upserts under a caller-chosen id, for deserialization", () => {
		const registry = new AssetRegistry();
		const program = stubProgram();

		registry.restoreMaterial("mat/1", "Ball", program, [
			{ type: MaterialPropertyType.VEC4, name: "u_color", value: [1, 0, 0, 1] },
		]);
		expect(
			registry
				.resolveMaterial("mat/1")
				.properties.find((p) => p.name === "u_color")?.value
		).toEqual([1, 0, 0, 1]);

		// Loading the same scene twice (or re-loading after edits) must not
		// throw on the id already being registered - it should just replace it.
		registry.restoreMaterial("mat/1", "Ball", program, [
			{ type: MaterialPropertyType.VEC4, name: "u_color", value: [0, 1, 0, 1] },
		]);
		expect(
			registry
				.resolveMaterial("mat/1")
				.properties.find((p) => p.name === "u_color")?.value
		).toEqual([0, 1, 0, 1]);
	});

	test("disposeMaterial drops the entry", () => {
		const registry = new AssetRegistry();
		const id = registry.createMaterial("Ball", stubProgram(), [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);

		registry.disposeMaterial(undefined, id);
		expect(() => registry.resolveMaterial(id)).toThrow(
			/No material registered/
		);
	});

	test("listMaterials returns every registered material's id and descriptor", () => {
		const registry = new AssetRegistry();
		const program = stubProgram();
		const a = registry.createMaterial("Ball A", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);
		const b = registry.createMaterial("Ball B", program, [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [0, 1, 0, 1],
			},
		]);

		const listed = registry.listMaterials();
		expect(listed.map((m) => m.id).sort()).toEqual([a, b].sort());
		expect(listed.find((m) => m.id === a)?.descriptor.name).toBe("Ball A");
		expect(listed.find((m) => m.id === b)?.descriptor.name).toBe("Ball B");
	});

	test("listMaterials on an empty registry returns []", () => {
		const registry = new AssetRegistry();
		expect(registry.listMaterials()).toEqual([]);
	});

	test("renameMaterial updates both the live object and the descriptor", () => {
		const registry = new AssetRegistry();
		const id = registry.createMaterial("Ball", stubProgram(), [
			{
				type: MaterialPropertyType.VEC4,
				name: "u_color",
				value: [1, 0, 0, 1],
			},
		]);

		registry.renameMaterial(id, "Wood");

		expect(registry.resolveMaterial(id).name).toBe("Wood");
		expect(registry.materialDescriptor(id).name).toBe("Wood");
	});
});
