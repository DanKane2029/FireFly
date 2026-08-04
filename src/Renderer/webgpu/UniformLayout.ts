import { mat3, mat4, vec3, vec4 } from "gl-matrix";

import { MAX_LIGHTS } from "../RenderBackend";

/**
 * The byte layout of the two uniform structs the WGSL shaders declare.
 *
 * WebGL lets you set a uniform by name and forget about memory - `uniform3fv`
 * takes a name and three floats. WebGPU has no such thing: uniforms are a
 * *buffer* the shader reinterprets as a struct, so the bytes this file writes
 * must land exactly where WGSL expects to read them. Get an offset wrong and
 * nothing errors - the scene just renders with garbage in it.
 *
 * The offsets below follow WGSL's uniform address space rules, which are
 * mostly "align each member to its own size, rounded up to 16 for anything
 * vector-or-larger". Two consequences catch people out, and both apply here:
 *
 * - **A `vec3` occupies 16 bytes, not 12.** `ambient` is followed by a
 *   4-byte `numLights` that slots into its padding for free.
 * - **A `mat3x3` occupies 48 bytes, not 36** - three columns, each a padded
 *   `vec3`. gl-matrix stores a mat3 as 9 tightly packed floats, so writing one
 *   means expanding it column by column. This is the single most common way
 *   to get a subtly wrong normal matrix, so `writeDrawUniforms` does it
 *   explicitly.
 * - **An `array<vec4>` has a 16-byte stride**, which is why the light
 *   positions are stored as vec4s with an unused `w` rather than packed vec3s.
 *
 * Every constant here has a twin in Shaders/wgsl/*.wgsl. If you change a
 * struct there, change it here, and the tests in Tests/UniformLayout.test.ts
 * will tell you whether the two still agree.
 */

/** Byte offsets into the per-frame uniform struct (`Frame` in WGSL). */
const FRAME = {
	view: 0,
	projection: 64,
	ambient: 128,
	numLights: 140,
	lights: 144,
} as const;

/** Total size of the per-frame uniform struct, in bytes. */
const FRAME_SIZE = FRAME.lights + MAX_LIGHTS * 16;

/** Byte offsets into the per-draw uniform struct (`Draw` in WGSL). */
const DRAW = {
	model: 0,
	normalMatrix: 64,
	color: 112,
	objectId: 128,
} as const;

/**
 * Total size of the per-draw uniform struct, in bytes: 132 bytes of members
 * rounded up to the struct's 16-byte alignment.
 *
 * This is *not* the stride between consecutive draws in the uniform buffer -
 * that has to satisfy the device's `minUniformBufferOffsetAlignment` (256 on
 * every implementation in practice), which `drawStride` computes.
 */
const DRAW_SIZE = 144;

/**
 * The spacing between consecutive per-draw structs in the shared uniform
 * buffer. Each draw binds the same buffer with a different dynamic offset, and
 * a dynamic offset must be a multiple of the device's alignment limit - so the
 * structs sit further apart than their own size.
 *
 * @param minUniformBufferOffsetAlignment - From `device.limits`
 */
function drawStride(minUniformBufferOffsetAlignment: number): number {
	const alignment = Math.max(1, minUniformBufferOffsetAlignment);
	return Math.ceil(DRAW_SIZE / alignment) * alignment;
}

/**
 * Writes the per-frame uniforms - the camera and the lighting environment,
 * everything that is the same for every object drawn this frame.
 *
 * @param buffer - CPU-side staging memory, at least FRAME_SIZE bytes
 * @param view - The camera's view matrix
 * @param projection - The camera's projection matrix
 * @param ambient - The scene's ambient light color
 * @param lightPositions - World-space point light positions. Anything past
 * MAX_LIGHTS is ignored, matching what the shader's array can hold.
 */
function writeFrameUniforms(
	buffer: ArrayBuffer,
	view: mat4,
	projection: mat4,
	ambient: vec3,
	lightPositions: vec3[]
): void {
	const floats = new Float32Array(buffer);
	const ints = new Int32Array(buffer);

	floats.set(view as Float32Array, FRAME.view / 4);
	floats.set(projection as Float32Array, FRAME.projection / 4);
	floats.set(
		[ambient[0], ambient[1], ambient[2]],
		FRAME.ambient / 4
	);

	const visible = Math.min(lightPositions.length, MAX_LIGHTS);
	ints[FRAME.numLights / 4] = visible;

	for (let i = 0; i < visible; i++) {
		const position = lightPositions[i];
		const base = FRAME.lights / 4 + i * 4;
		floats[base] = position[0];
		floats[base + 1] = position[1];
		floats[base + 2] = position[2];
		floats[base + 3] = 1;
	}
}

/**
 * Writes one object's per-draw uniforms at `byteOffset` within the shared
 * per-draw buffer.
 *
 * @param buffer - CPU-side staging memory for the whole frame's draws
 * @param byteOffset - Where this draw's struct starts (a multiple of
 * `drawStride`)
 * @param model - The object's world transform
 * @param normalMatrix - The inverse-transpose of `model`, so normals survive
 * non-uniform scale
 * @param color - The material's base color
 * @param objectId - The id written to the picking target
 */
function writeDrawUniforms(
	buffer: ArrayBuffer,
	byteOffset: number,
	model: mat4,
	normalMatrix: mat3,
	color: vec4,
	objectId: number
): void {
	const floats = new Float32Array(buffer);
	const ints = new Int32Array(buffer);
	const base = byteOffset / 4;

	floats.set(model as Float32Array, base + DRAW.model / 4);

	// mat3x3 is three 16-byte columns, but gl-matrix packs its 9 floats with
	// no padding - so copy column by column rather than in one set().
	for (let column = 0; column < 3; column++) {
		const target = base + DRAW.normalMatrix / 4 + column * 4;
		floats[target] = normalMatrix[column * 3];
		floats[target + 1] = normalMatrix[column * 3 + 1];
		floats[target + 2] = normalMatrix[column * 3 + 2];
		floats[target + 3] = 0;
	}

	floats.set(
		[color[0], color[1], color[2], color[3]],
		base + DRAW.color / 4
	);
	ints[base + DRAW.objectId / 4] = objectId;
}

export {
	DRAW,
	DRAW_SIZE,
	FRAME,
	FRAME_SIZE,
	drawStride,
	writeDrawUniforms,
	writeFrameUniforms,
};
