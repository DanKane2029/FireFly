import { describe, expect, test } from "@jest/globals";
import { parseGLB } from "../Geometry/GLTFLoader";

/**
 * A minimal .glb encoder, test-only. Real exporters (Blender, gltf-pipeline,
 * ...) are the actual source of .glb files this loader parses in practice,
 * but constructing a synthetic one here is what lets each test target one
 * specific piece of the format (a bad magic number, a sparse accessor, a
 * node hierarchy) in isolation, including malformed shapes no real exporter
 * would ever produce.
 */

const GLB_MAGIC = 0x46546c67;
const CHUNK_TYPE_JSON = 0x4e4f534a;
const CHUNK_TYPE_BIN = 0x004e4942;

function padTo4(bytes: Uint8Array, fill: number): Uint8Array {
	const remainder = bytes.length % 4;
	if (remainder === 0) {
		return bytes;
	}
	const padded = new Uint8Array(bytes.length + (4 - remainder));
	padded.set(bytes);
	padded.fill(fill, bytes.length);
	return padded;
}

function encodeGLB(doc: unknown, binaryChunk: Uint8Array): Uint8Array {
	const jsonBytes = padTo4(
		new TextEncoder().encode(JSON.stringify(doc)),
		0x20
	);
	const binBytes = padTo4(binaryChunk, 0);

	const totalLength =
		12 + 8 + jsonBytes.length + (binBytes.length > 0 ? 8 + binBytes.length : 0);
	const buffer = new ArrayBuffer(totalLength);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	view.setUint32(0, GLB_MAGIC, true);
	view.setUint32(4, 2, true);
	view.setUint32(8, totalLength, true);

	let offset = 12;
	view.setUint32(offset, jsonBytes.length, true);
	view.setUint32(offset + 4, CHUNK_TYPE_JSON, true);
	bytes.set(jsonBytes, offset + 8);
	offset += 8 + jsonBytes.length;

	if (binBytes.length > 0) {
		view.setUint32(offset, binBytes.length, true);
		view.setUint32(offset + 4, CHUNK_TYPE_BIN, true);
		bytes.set(binBytes, offset + 8);
	}

	return bytes;
}

/** Packs typed data into the binary chunk, tracking bufferViews as it goes -
 * each add* call returns the bufferView index to reference from an accessor. */
class BinaryChunkBuilder {
	private segments: Uint8Array[] = [];
	private cursor = 0;
	readonly bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];

	addFloat32(values: number[]): number {
		return this.add(new Uint8Array(new Float32Array(values).buffer));
	}

	addUint16(values: number[]): number {
		return this.add(new Uint8Array(new Uint16Array(values).buffer));
	}

	addBytes(bytes: Uint8Array): number {
		return this.add(bytes);
	}

	private add(bytes: Uint8Array): number {
		while (this.cursor % 4 !== 0) {
			this.segments.push(new Uint8Array(1));
			this.cursor += 1;
		}
		const index = this.bufferViews.length;
		this.bufferViews.push({ buffer: 0, byteOffset: this.cursor, byteLength: bytes.length });
		this.segments.push(bytes);
		this.cursor += bytes.length;
		return index;
	}

	build(): Uint8Array {
		const out = new Uint8Array(this.cursor);
		let offset = 0;
		for (const segment of this.segments) {
			out.set(segment, offset);
			offset += segment.length;
		}
		return out;
	}
}

/** A single unit triangle: 3 vertices with position + normal (+z), no
 * texCoord, no material, no node hierarchy - the smallest valid document
 * this loader accepts. */
function basicTriangleGLB(): Uint8Array {
	const bin = new BinaryChunkBuilder();
	const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
	const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
	const indexView = bin.addUint16([0, 1, 2]);

	const doc = {
		asset: { version: "2.0" },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [
			{
				primitives: [
					{
						attributes: { POSITION: 0, NORMAL: 1 },
						indices: 2,
					},
				],
			},
		],
		accessors: [
			{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
			{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
			{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
		],
		bufferViews: bin.bufferViews,
		buffers: [{ byteLength: bin.build().byteLength }],
	};

	return encodeGLB(doc, bin.build());
}

describe("parseGLB", () => {
	test("parses a basic triangle: position, normal, one node, no material", () => {
		const parsed = parseGLB(basicTriangleGLB());

		expect(parsed.nodeInstances).toHaveLength(1);
		const [instance] = parsed.nodeInstances;
		expect(instance.primitives).toHaveLength(1);

		const mesh = instance.primitives[0].mesh;
		expect(mesh.vertexList).toHaveLength(3);
		expect(mesh.indicesList).toEqual([[0, 1, 2]]);
		expect(instance.primitives[0].materialIndex).toBeNull();
		expect(parsed.materials.size).toBe(0);
		expect(parsed.images.size).toBe(0);
	});

	test("a node's transform is its scene-root world position", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);

		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0, translation: [5, 0, 0] }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] },
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};

		const parsed = parseGLB(encodeGLB(doc, bin.build()));
		expect(Array.from(parsed.nodeInstances[0].transform.translation)).toEqual([
			5, 0, 0,
		]);
	});

	test("flattens a parent/child node hierarchy to a combined world transform", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);

		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			// Parent translates by (10,0,0); child (which owns the mesh)
			// translates by (0,3,0) *in the parent's space* - the world
			// position should be the sum, (10,3,0).
			nodes: [
				{ children: [1], translation: [10, 0, 0] },
				{ mesh: 0, translation: [0, 3, 0] },
			],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] },
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};

		const parsed = parseGLB(encodeGLB(doc, bin.build()));
		expect(parsed.nodeInstances).toHaveLength(1);
		const translation = parsed.nodeInstances[0].transform.translation;
		expect(translation[0]).toBeCloseTo(10);
		expect(translation[1]).toBeCloseTo(3);
		expect(translation[2]).toBeCloseTo(0);
	});

	test("reads TEXCOORD_0, baseColorFactor, and an embedded baseColorTexture image's raw bytes", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const texCoordView = bin.addFloat32([0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);
		const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]); // fake PNG-ish bytes
		const imageView = bin.addBytes(imageBytes);

		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{
					primitives: [
						{
							attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
							indices: 3,
							material: 0,
						},
					],
				},
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: texCoordView, componentType: 5126, count: 3, type: "VEC2" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
			materials: [
				{
					name: "Test Material",
					pbrMetallicRoughness: {
						baseColorFactor: [0.2, 0.4, 0.6, 1],
						baseColorTexture: { index: 0 },
					},
				},
			],
			textures: [{ source: 0 }],
			images: [{ bufferView: imageView, mimeType: "image/png" }],
		};

		const parsed = parseGLB(encodeGLB(doc, bin.build()));

		const mesh = parsed.nodeInstances[0].primitives[0].mesh;
		expect(mesh.vertexList[0].textureCoord).toBeDefined();
		expect(Array.from(mesh.vertexList[1].textureCoord ?? [])).toEqual([1, 0]);

		expect(parsed.materials.get(0)?.name).toBe("Test Material");
		expect(parsed.materials.get(0)?.baseColorFactor).toEqual([0.2, 0.4, 0.6, 1]);
		expect(parsed.materials.get(0)?.baseColorTextureImageIndex).toBe(0);

		const image = parsed.images.get(0);
		expect(image?.mimeType).toBe("image/png");
		expect(Array.from(image?.bytes ?? [])).toEqual(Array.from(imageBytes));
	});

	test("a primitive with no material resolves to a null materialIndex", () => {
		const parsed = parseGLB(basicTriangleGLB());
		expect(parsed.nodeInstances[0].primitives[0].materialIndex).toBeNull();
	});

	test("only captures materials/images actually referenced by a used primitive", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);

		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }, // no material
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
			// An unused material sitting in the file - should never be parsed.
			materials: [{ name: "Unused" }],
		};

		const parsed = parseGLB(encodeGLB(doc, bin.build()));
		expect(parsed.materials.size).toBe(0);
	});

	test("rejects a file with a bad magic number", () => {
		const bytes = basicTriangleGLB();
		bytes[0] = 0; // corrupt the magic number
		expect(() => parseGLB(bytes)).toThrow(/magic/);
	});

	test("rejects an unsupported glTF binary container version", () => {
		const bytes = basicTriangleGLB();
		const view = new DataView(bytes.buffer);
		view.setUint32(4, 99, true);
		expect(() => parseGLB(bytes)).toThrow(/version/);
	});

	test("rejects an unsupported glTF asset version", () => {
		const bin = new BinaryChunkBuilder();
		const doc = { asset: { version: "1.0" }, scenes: [{ nodes: [] }] };
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(
			/asset version/
		);
	});

	test("rejects a primitive with no NORMAL attribute", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const indexView = bin.addUint16([0, 1, 2]);
		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(/NORMAL/);
	});

	test("rejects a non-triangle primitive mode", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);
		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{
					primitives: [
						{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 1 }, // LINES
					],
				},
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(
			/triangles/
		);
	});

	test("rejects a sparse accessor", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);
		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] },
			],
			accessors: [
				{
					bufferView: positionView,
					componentType: 5126,
					count: 3,
					type: "VEC3",
					sparse: { count: 1, indices: {}, values: {} },
				},
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(/sparse/);
	});

	test("rejects an external buffer URI", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const indexView = bin.addUint16([0, 1, 2]);
		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] },
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength, uri: "external.bin" }],
		};
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(
			/External buffer/
		);
	});

	test("rejects a non-indexed primitive", () => {
		const bin = new BinaryChunkBuilder();
		const positionView = bin.addFloat32([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		const normalView = bin.addFloat32([0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const doc = {
			asset: { version: "2.0" },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [
				{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }, // no indices
			],
			accessors: [
				{ bufferView: positionView, componentType: 5126, count: 3, type: "VEC3" },
				{ bufferView: normalView, componentType: 5126, count: 3, type: "VEC3" },
			],
			bufferViews: bin.bufferViews,
			buffers: [{ byteLength: bin.build().byteLength }],
		};
		expect(() => parseGLB(encodeGLB(doc, bin.build()))).toThrow(
			/Non-indexed/
		);
	});

	test("rejects a file with no JSON chunk", () => {
		const buffer = new ArrayBuffer(12);
		const view = new DataView(buffer);
		view.setUint32(0, GLB_MAGIC, true);
		view.setUint32(4, 2, true);
		view.setUint32(8, 12, true);
		expect(() => parseGLB(new Uint8Array(buffer))).toThrow(/JSON chunk/);
	});
});
