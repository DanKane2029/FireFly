import { mat4, quat, vec2, vec3 } from "gl-matrix";
import { VertexBufferLayout, VertexLayout, VertexTypes } from "../Renderer/Buffer";
import { Mesh } from "./Mesh";
import { Vertex } from "./Vertex";
import {
	TransformData,
	transformFromMatrix,
} from "../ecs/components/Transform";

/**
 * Loads triangle meshes, materials, and node transforms from a glTF 2.0
 * binary (.glb) file.
 *
 * Deliberately narrow, and says so - the stated boundary is the portfolio
 * artifact: `.glb` only (one binary, so external `.bin`/image URIs never
 * come up), triangles only, POSITION/NORMAL/TEXCOORD_0 attributes, and
 * `pbrMetallicRoughness.baseColorFactor`/`baseColorTexture`. A file that
 * needs anything past that throws a clear, named error instead of silently
 * rendering something wrong. Explicitly NOT supported: sparse accessors,
 * animation, skinning, morph targets, Draco compression, any KHR_*
 * extension, meshes without a NORMAL attribute, and non-indexed primitives.
 *
 * Image bytes (for baseColorTexture) are returned encoded (PNG/JPEG), not
 * decoded to pixels - decoding needs a DOM (createImageBitmap + canvas),
 * which this module deliberately never touches, so everything here stays
 * unit-testable without a browser. See decodeImage.ts for the DOM-dependent
 * half, and App.importModel for how the two are used together.
 */

// --- the GLB binary container ---------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF", little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

interface GLBChunks {
	json: unknown;
	binary: Uint8Array | null;
}

/** Splits a .glb file into its JSON and (optional) binary chunks. */
function parseGLBContainer(bytes: Uint8Array): GLBChunks {
	if (bytes.byteLength < 12) {
		throw new Error("Not a .glb file (too short for a header).");
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	const magic = view.getUint32(0, true);
	if (magic !== GLB_MAGIC) {
		throw new Error("Not a .glb file (bad magic number).");
	}
	const version = view.getUint32(4, true);
	if (version !== 2) {
		throw new Error(
			`Unsupported glTF binary version ${version} - only version 2 is supported.`
		);
	}
	const totalLength = view.getUint32(8, true);
	if (totalLength > bytes.byteLength) {
		throw new Error("Truncated .glb file (declared length exceeds actual size).");
	}

	let offset = 12;
	let json: unknown = null;
	let binary: Uint8Array | null = null;

	while (offset + 8 <= totalLength) {
		const chunkLength = view.getUint32(offset, true);
		const chunkType = view.getUint32(offset + 4, true);
		const chunkStart = offset + 8;
		const chunkData = bytes.subarray(chunkStart, chunkStart + chunkLength);

		if (chunkType === CHUNK_TYPE_JSON) {
			json = JSON.parse(new TextDecoder("utf-8").decode(chunkData));
		} else if (chunkType === CHUNK_TYPE_BIN) {
			binary = chunkData;
		}
		// Any other chunk type is skipped, per spec - forward compatibility
		// for chunk types this loader doesn't know about.

		offset = chunkStart + chunkLength;
	}

	if (json === null) {
		throw new Error(".glb file has no JSON chunk.");
	}
	return { json, binary };
}

// --- the glTF JSON document (only the fields this loader reads) ----------

interface GLTFDocument {
	asset?: { version?: string };
	scene?: number;
	scenes?: { nodes?: number[] }[];
	nodes?: GLTFNode[];
	meshes?: GLTFMesh[];
	accessors?: GLTFAccessor[];
	bufferViews?: GLTFBufferView[];
	buffers?: GLTFBuffer[];
	materials?: GLTFMaterial[];
	textures?: GLTFTexture[];
	images?: GLTFImage[];
}

interface GLTFNode {
	name?: string;
	children?: number[];
	mesh?: number;
	translation?: [number, number, number];
	rotation?: [number, number, number, number]; // quaternion, xyzw
	scale?: [number, number, number];
	matrix?: number[]; // column-major, length 16
}

interface GLTFMesh {
	primitives: GLTFPrimitive[];
}

interface GLTFPrimitive {
	attributes: Record<string, number>;
	indices?: number;
	material?: number;
	mode?: number;
}

interface GLTFAccessor {
	bufferView?: number;
	byteOffset?: number;
	componentType: number;
	normalized?: boolean;
	count: number;
	type: string;
	sparse?: unknown;
}

interface GLTFBufferView {
	buffer: number;
	byteOffset?: number;
	byteLength: number;
	byteStride?: number;
}

interface GLTFBuffer {
	byteLength: number;
	uri?: string;
}

interface GLTFMaterial {
	name?: string;
	pbrMetallicRoughness?: {
		baseColorFactor?: [number, number, number, number];
		baseColorTexture?: { index: number; texCoord?: number };
	};
}

interface GLTFTexture {
	source?: number;
}

interface GLTFImage {
	bufferView?: number;
	mimeType?: string;
	uri?: string;
}

const MODE_TRIANGLES = 4;

const COMPONENT_TYPE_UNSIGNED_BYTE = 5121;
const COMPONENT_TYPE_UNSIGNED_SHORT = 5123;
const COMPONENT_TYPE_UNSIGNED_INT = 5125;
const COMPONENT_TYPE_FLOAT = 5126;

function componentByteSize(componentType: number): number {
	switch (componentType) {
		case COMPONENT_TYPE_UNSIGNED_BYTE:
			return 1;
		case COMPONENT_TYPE_UNSIGNED_SHORT:
			return 2;
		case COMPONENT_TYPE_UNSIGNED_INT:
		case COMPONENT_TYPE_FLOAT:
			return 4;
		default:
			throw new Error(`Unsupported accessor componentType ${componentType}.`);
	}
}

// --- accessor reading ------------------------------------------------------
//
// Deliberately three narrow functions (position/normal, texCoord, indices)
// rather than one fully generic accessor reader: a generic reader would also
// have to handle MAT4 (inverse bind matrices), joint/weight attributes, and
// sparse storage - all skinning/animation machinery this loader explicitly
// doesn't support. Reading exactly the three shapes actually used keeps the
// unsupported cases a clear, named error instead of a silent misread.

interface AccessorLocation {
	accessor: GLTFAccessor;
	view: GLTFBufferView;
}

function locateAccessor(
	doc: GLTFDocument,
	accessorIndex: number
): AccessorLocation {
	const accessor = doc.accessors?.[accessorIndex];
	if (!accessor) {
		throw new Error(`Missing accessor ${accessorIndex}.`);
	}
	if (accessor.sparse) {
		throw new Error(
			`Accessor ${accessorIndex} uses sparse storage, which is not supported.`
		);
	}
	if (accessor.bufferView === undefined) {
		throw new Error(
			`Accessor ${accessorIndex} has no bufferView (implicit zero-fill is not supported).`
		);
	}
	const view = doc.bufferViews?.[accessor.bufferView];
	if (!view) {
		throw new Error(`Missing bufferView ${accessor.bufferView}.`);
	}
	const buffer = doc.buffers?.[view.buffer];
	if (!buffer) {
		throw new Error(`Missing buffer ${view.buffer}.`);
	}
	if (buffer.uri !== undefined) {
		throw new Error(
			"External buffer URIs are not supported - only the .glb file's own embedded binary chunk is."
		);
	}
	return { accessor, view };
}

function readVec3Accessor(
	doc: GLTFDocument,
	binaryView: DataView,
	accessorIndex: number
): vec3[] {
	const { accessor, view } = locateAccessor(doc, accessorIndex);
	if (accessor.type !== "VEC3") {
		throw new Error(`Expected a VEC3 accessor, got "${accessor.type}".`);
	}
	if (accessor.componentType !== COMPONENT_TYPE_FLOAT) {
		throw new Error(
			`Only FLOAT VEC3 accessors are supported (got componentType ${accessor.componentType}).`
		);
	}

	const stride = view.byteStride ?? 12;
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

	const result: vec3[] = [];
	for (let i = 0; i < accessor.count; i++) {
		const o = base + i * stride;
		result.push(
			vec3.fromValues(
				binaryView.getFloat32(o, true),
				binaryView.getFloat32(o + 4, true),
				binaryView.getFloat32(o + 8, true)
			)
		);
	}
	return result;
}

/** Decodes one TEXCOORD component pair, applying the normalized-integer
 * scaling the spec defines for quantized UVs (see accessor.normalized). */
function readTexCoordPair(
	view: DataView,
	byteOffset: number,
	componentType: number,
	normalized: boolean
): [number, number] {
	switch (componentType) {
		case COMPONENT_TYPE_FLOAT:
			return [
				view.getFloat32(byteOffset, true),
				view.getFloat32(byteOffset + 4, true),
			];
		case COMPONENT_TYPE_UNSIGNED_BYTE: {
			const u = view.getUint8(byteOffset);
			const v = view.getUint8(byteOffset + 1);
			return normalized ? [u / 255, v / 255] : [u, v];
		}
		case COMPONENT_TYPE_UNSIGNED_SHORT: {
			const u = view.getUint16(byteOffset, true);
			const v = view.getUint16(byteOffset + 2, true);
			return normalized ? [u / 65535, v / 65535] : [u, v];
		}
		default:
			throw new Error(
				`Unsupported TEXCOORD componentType ${componentType}.`
			);
	}
}

function readVec2Accessor(
	doc: GLTFDocument,
	binaryView: DataView,
	accessorIndex: number
): vec2[] {
	const { accessor, view } = locateAccessor(doc, accessorIndex);
	if (accessor.type !== "VEC2") {
		throw new Error(`Expected a VEC2 accessor, got "${accessor.type}".`);
	}

	const stride =
		view.byteStride ?? componentByteSize(accessor.componentType) * 2;
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

	const result: vec2[] = [];
	for (let i = 0; i < accessor.count; i++) {
		const o = base + i * stride;
		const [u, v] = readTexCoordPair(
			binaryView,
			o,
			accessor.componentType,
			accessor.normalized ?? false
		);
		result.push(vec2.fromValues(u, v));
	}
	return result;
}

function readIndicesAccessor(
	doc: GLTFDocument,
	binaryView: DataView,
	accessorIndex: number
): number[] {
	const { accessor, view } = locateAccessor(doc, accessorIndex);
	if (accessor.type !== "SCALAR") {
		throw new Error(
			`Expected a SCALAR indices accessor, got "${accessor.type}".`
		);
	}

	const compSize = componentByteSize(accessor.componentType);
	const stride = view.byteStride ?? compSize;
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

	const result: number[] = [];
	for (let i = 0; i < accessor.count; i++) {
		const o = base + i * stride;
		switch (accessor.componentType) {
			case COMPONENT_TYPE_UNSIGNED_BYTE:
				result.push(binaryView.getUint8(o));
				break;
			case COMPONENT_TYPE_UNSIGNED_SHORT:
				result.push(binaryView.getUint16(o, true));
				break;
			case COMPONENT_TYPE_UNSIGNED_INT:
				result.push(binaryView.getUint32(o, true));
				break;
			default:
				throw new Error(
					`Unsupported index componentType ${accessor.componentType}.`
				);
		}
	}
	return result;
}

// --- primitives -> Mesh -----------------------------------------------------

interface GLTFPrimitiveResult {
	mesh: Mesh;
	materialIndex: number | null;
}

function buildMeshFromPrimitive(
	doc: GLTFDocument,
	binaryView: DataView,
	primitive: GLTFPrimitive
): GLTFPrimitiveResult {
	if (primitive.mode !== undefined && primitive.mode !== MODE_TRIANGLES) {
		throw new Error(
			`Unsupported primitive mode ${primitive.mode} - only triangles (mode 4) are supported.`
		);
	}

	const positionAccessor = primitive.attributes.POSITION;
	if (positionAccessor === undefined) {
		throw new Error("Primitive has no POSITION attribute.");
	}
	const positions = readVec3Accessor(doc, binaryView, positionAccessor);

	const normalAccessor = primitive.attributes.NORMAL;
	if (normalAccessor === undefined) {
		throw new Error(
			"Primitive has no NORMAL attribute - meshes without normals are not supported (re-export with normals included)."
		);
	}
	const normals = readVec3Accessor(doc, binaryView, normalAccessor);

	const texCoordAccessor = primitive.attributes.TEXCOORD_0;
	const texCoords =
		texCoordAccessor !== undefined
			? readVec2Accessor(doc, binaryView, texCoordAccessor)
			: null;

	if (primitive.indices === undefined) {
		throw new Error(
			"Non-indexed primitives are not supported (every primitive must have an indices accessor)."
		);
	}
	const flatIndices = readIndicesAccessor(doc, binaryView, primitive.indices);
	if (flatIndices.length % 3 !== 0) {
		throw new Error(
			"Index count is not a multiple of 3 for a triangle primitive."
		);
	}
	const triangles: number[][] = [];
	for (let i = 0; i < flatIndices.length; i += 3) {
		triangles.push([flatIndices[i], flatIndices[i + 1], flatIndices[i + 2]]);
	}

	const vertexList: Vertex[] = positions.map((position, i) => ({
		position,
		normal: normals[i],
		textureCoord: texCoords ? texCoords[i] : undefined,
	}));

	const attributes: VertexLayout[] = [
		{ name: "a_position", size: 3, type: VertexTypes.FLOAT, normalized: false },
		{ name: "a_normal", size: 3, type: VertexTypes.FLOAT, normalized: true },
	];
	if (texCoords) {
		attributes.push({
			name: "a_texCoord",
			size: 2,
			type: VertexTypes.FLOAT,
			normalized: false,
		});
	}

	return {
		mesh: new Mesh(vertexList, triangles, new VertexBufferLayout(attributes)),
		materialIndex: primitive.material ?? null,
	};
}

// --- node hierarchy: flatten to world TRS -----------------------------------
//
// glTF nodes form a hierarchy; the ECS is flat (see src/ecs/README.md), so
// each mesh-bearing node's *world* transform - accumulated by multiplying
// down from the scene roots - becomes one flat entity. transformFromMatrix
// decomposes that world matrix back to TRS, which is exact for uniform
// scale and approximate otherwise (see its doc comment).

function localNodeMatrix(node: GLTFNode): mat4 {
	if (node.matrix) {
		return mat4.clone(node.matrix as mat4);
	}
	const translation = (node.translation ?? [0, 0, 0]) as vec3;
	const rotation = (node.rotation ?? [0, 0, 0, 1]) as quat;
	const scale = (node.scale ?? [1, 1, 1]) as vec3;
	return mat4.fromRotationTranslationScale(
		mat4.create(),
		rotation,
		translation,
		scale
	);
}

export interface GLTFNodeInstance {
	name?: string;
	/** The glTF mesh index this node references - kept (rather than just the
	 * already-built Mesh objects) so a caller can build a MeshDescriptor
	 * that's meaningful to re-resolve later, not just usable immediately. */
	meshIndex: number;
	primitives: GLTFPrimitiveResult[];
	transform: TransformData;
}

function flattenScene(
	doc: GLTFDocument,
	binaryView: DataView
): GLTFNodeInstance[] {
	const sceneIndex = doc.scene ?? 0;
	const rootNodeIndices = doc.scenes?.[sceneIndex]?.nodes ?? [];
	const nodeInstances: GLTFNodeInstance[] = [];

	const visit = (nodeIndex: number, parentWorld: mat4): void => {
		const node = doc.nodes?.[nodeIndex];
		if (!node) {
			throw new Error(`Missing node ${nodeIndex}.`);
		}

		const world = mat4.create();
		mat4.multiply(world, parentWorld, localNodeMatrix(node));

		if (node.mesh !== undefined) {
			const meshDef = doc.meshes?.[node.mesh];
			if (!meshDef) {
				throw new Error(`Missing mesh ${node.mesh}.`);
			}
			nodeInstances.push({
				name: node.name,
				meshIndex: node.mesh,
				primitives: meshDef.primitives.map((primitive) =>
					buildMeshFromPrimitive(doc, binaryView, primitive)
				),
				transform: transformFromMatrix(world),
			});
		}

		(node.children ?? []).forEach((childIndex) => visit(childIndex, world));
	};

	rootNodeIndices.forEach((rootIndex) => visit(rootIndex, mat4.create()));
	return nodeInstances;
}

// --- materials and images ---------------------------------------------------

export interface GLTFMaterialInfo {
	name?: string;
	baseColorFactor: [number, number, number, number];
	baseColorTextureImageIndex: number | null;
}

function readMaterial(doc: GLTFDocument, materialIndex: number): GLTFMaterialInfo {
	const material = doc.materials?.[materialIndex];
	if (!material) {
		throw new Error(`Missing material ${materialIndex}.`);
	}
	const pbr = material.pbrMetallicRoughness;
	const baseColorTexture = pbr?.baseColorTexture;
	const textureSource =
		baseColorTexture !== undefined
			? doc.textures?.[baseColorTexture.index]?.source
			: undefined;

	return {
		name: material.name,
		// glTF's own default material (used when a primitive has no material
		// at all - see flattenScene's callers) is opaque white, matching what
		// a missing baseColorFactor defaults to here too.
		baseColorFactor: pbr?.baseColorFactor ?? [1, 1, 1, 1],
		baseColorTextureImageIndex: textureSource ?? null,
	};
}

export interface GLTFImageBytes {
	bytes: Uint8Array;
	mimeType: string;
}

function readImageBytes(
	doc: GLTFDocument,
	binary: Uint8Array | null,
	imageIndex: number
): GLTFImageBytes {
	const image = doc.images?.[imageIndex];
	if (!image) {
		throw new Error(`Missing image ${imageIndex}.`);
	}
	if (image.uri !== undefined) {
		throw new Error(
			"External image URIs are not supported - only images embedded in the .glb binary chunk are."
		);
	}
	if (image.bufferView === undefined) {
		throw new Error(
			`Image ${imageIndex} has neither a bufferView nor a uri - nothing to read.`
		);
	}
	if (!binary) {
		throw new Error("This .glb has no embedded binary chunk.");
	}
	const view = doc.bufferViews?.[image.bufferView];
	if (!view) {
		throw new Error(`Missing bufferView ${image.bufferView}.`);
	}
	const base = view.byteOffset ?? 0;
	return {
		bytes: binary.subarray(base, base + view.byteLength),
		mimeType: image.mimeType ?? "image/png",
	};
}

// --- public entry point ------------------------------------------------------

export interface ParsedGLTF {
	nodeInstances: GLTFNodeInstance[];
	/** Keyed by glTF material index - only materials actually referenced by a
	 * used primitive, not every material the file happens to declare. */
	materials: Map<number, GLTFMaterialInfo>;
	/** Keyed by glTF image index - only images actually referenced by a used
	 * material's baseColorTexture. Bytes are still encoded (PNG/JPEG); decode
	 * with decodeImage.ts. */
	images: Map<number, GLTFImageBytes>;
}

/**
 * Parses a `.glb` file's bytes into meshes (each already flattened to a
 * world-space Transform), the materials they reference, and the raw encoded
 * bytes of any textures those materials use.
 */
export function parseGLB(bytes: Uint8Array): ParsedGLTF {
	const { json, binary } = parseGLBContainer(bytes);
	const doc = json as GLTFDocument;

	if (doc.asset?.version !== "2.0") {
		throw new Error(
			`Unsupported glTF asset version "${doc.asset?.version}" - only "2.0" is supported.`
		);
	}

	const binaryView = binary
		? new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
		: new DataView(new ArrayBuffer(0));

	const nodeInstances = flattenScene(doc, binaryView);

	const usedMaterialIndices = new Set<number>();
	nodeInstances.forEach((instance) =>
		instance.primitives.forEach((primitive) => {
			if (primitive.materialIndex !== null) {
				usedMaterialIndices.add(primitive.materialIndex);
			}
		})
	);
	const materials = new Map<number, GLTFMaterialInfo>();
	usedMaterialIndices.forEach((index) =>
		materials.set(index, readMaterial(doc, index))
	);

	const usedImageIndices = new Set<number>();
	materials.forEach((material) => {
		if (material.baseColorTextureImageIndex !== null) {
			usedImageIndices.add(material.baseColorTextureImageIndex);
		}
	});
	const images = new Map<number, GLTFImageBytes>();
	usedImageIndices.forEach((index) =>
		images.set(index, readImageBytes(doc, binary, index))
	);

	return { nodeInstances, materials, images };
}
