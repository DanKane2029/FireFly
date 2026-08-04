import { describe, expect, test } from "@jest/globals";
import { mat3, mat4, vec3 } from "gl-matrix";

import { MAX_LIGHTS } from "../Renderer/RenderBackend";
import {
	DRAW,
	DRAW_SIZE,
	FRAME,
	FRAME_SIZE,
	drawStride,
	writeDrawUniforms,
	writeFrameUniforms,
} from "../Renderer/webgpu/UniformLayout";

/**
 * The WebGPU backend's uniforms are raw bytes that the WGSL shaders
 * reinterpret as structs. Nothing validates the two against each other at
 * runtime - a wrong offset renders a subtly wrong scene rather than throwing -
 * so these tests are the only thing standing between a padding mistake and a
 * confusing visual bug.
 */
describe("WebGPU uniform layout", () => {
	test("frame struct offsets follow WGSL's alignment rules", () => {
		expect(FRAME.view).toBe(0);
		// mat4x4 is 64 bytes.
		expect(FRAME.projection).toBe(64);
		expect(FRAME.ambient).toBe(128);
		// A vec3 is 12 bytes of data but 16 of alignment, and a following
		// 4-byte scalar slots into the padding rather than starting a new
		// 16-byte row.
		expect(FRAME.numLights).toBe(FRAME.ambient + 12);
		expect(FRAME.lights).toBe(144);
		// An array element in the uniform address space is padded to 16 bytes,
		// which is why the lights are vec4 with an unused w.
		expect(FRAME_SIZE).toBe(144 + MAX_LIGHTS * 16);
	});

	test("draw struct leaves a mat3x3 its full 48 bytes", () => {
		expect(DRAW.model).toBe(0);
		expect(DRAW.normalMatrix).toBe(64);
		// Three columns, each a vec3 padded to 16 bytes - NOT 9 * 4 = 36. This
		// is the single easiest offset to get wrong.
		expect(DRAW.color).toBe(DRAW.normalMatrix + 48);
		expect(DRAW.objectId).toBe(128);
		expect(DRAW_SIZE).toBe(144);
	});

	test("draw stride is rounded up to the device's dynamic-offset alignment", () => {
		// The usual limit. The struct is smaller than this, so consecutive
		// draws sit further apart than their own size.
		expect(drawStride(256)).toBe(256);
		// A device with a smaller limit still gets a stride that covers the
		// struct.
		expect(drawStride(64)).toBe(192);
		expect(drawStride(64)).toBeGreaterThanOrEqual(DRAW_SIZE);
	});

	test("writes the camera, ambient light, and light positions where the shader reads them", () => {
		const buffer = new ArrayBuffer(FRAME_SIZE);
		const view = mat4.fromTranslation(mat4.create(), [1, 2, 3]);
		const projection = mat4.perspective(mat4.create(), 1, 1.5, 0.1, 100);

		writeFrameUniforms(
			buffer,
			view,
			projection,
			vec3.fromValues(0.1, 0.2, 0.3),
			[vec3.fromValues(5, 6, 7), vec3.fromValues(8, 9, 10)]
		);

		const floats = new Float32Array(buffer);
		const ints = new Int32Array(buffer);

		expect(Array.from(floats.slice(0, 16))).toEqual(Array.from(view));
		expect(Array.from(floats.slice(16, 32))).toEqual(
			Array.from(projection)
		);
		expect(Array.from(floats.slice(32, 35))).toEqual([
			0.10000000149011612, 0.20000000298023224, 0.30000001192092896,
		]);
		expect(ints[FRAME.numLights / 4]).toBe(2);

		const lightBase = FRAME.lights / 4;
		expect(Array.from(floats.slice(lightBase, lightBase + 4))).toEqual([
			5, 6, 7, 1,
		]);
		// The second light starts a full 16 bytes later, not 12.
		expect(Array.from(floats.slice(lightBase + 4, lightBase + 8))).toEqual([
			8, 9, 10, 1,
		]);
	});

	test("ignores lights past MAX_LIGHTS rather than writing past the array", () => {
		const buffer = new ArrayBuffer(FRAME_SIZE);
		const lights = Array.from({ length: MAX_LIGHTS + 5 }, (_, i) =>
			vec3.fromValues(i, 0, 0)
		);

		writeFrameUniforms(
			buffer,
			mat4.create(),
			mat4.create(),
			vec3.create(),
			lights
		);

		expect(new Int32Array(buffer)[FRAME.numLights / 4]).toBe(MAX_LIGHTS);
	});

	test("expands a gl-matrix mat3 into three padded columns", () => {
		const buffer = new ArrayBuffer(DRAW_SIZE);
		// 1..9 in gl-matrix's tightly packed, column-major order.
		const normalMatrix = mat3.fromValues(1, 2, 3, 4, 5, 6, 7, 8, 9);

		writeDrawUniforms(
			buffer,
			0,
			mat4.create(),
			normalMatrix,
			[0.25, 0.5, 0.75, 1],
			42
		);

		const floats = new Float32Array(buffer);
		const base = DRAW.normalMatrix / 4;
		// Each column occupies four floats, the last of which is padding -
		// copying all nine floats in one go would land column 1 at float 3
		// instead of float 4 and shear every normal in the scene.
		expect(Array.from(floats.slice(base, base + 12))).toEqual([
			1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
		]);
		expect(Array.from(floats.slice(DRAW.color / 4, DRAW.color / 4 + 4))).toEqual(
			[0.25, 0.5, 0.75, 1]
		);
		expect(new Int32Array(buffer)[DRAW.objectId / 4]).toBe(42);
	});

	test("stages consecutive draws at their own stride", () => {
		const stride = drawStride(256);
		const buffer = new ArrayBuffer(stride * 2);

		writeDrawUniforms(
			buffer,
			0,
			mat4.create(),
			mat3.create(),
			[1, 0, 0, 1],
			7
		);
		writeDrawUniforms(
			buffer,
			stride,
			mat4.create(),
			mat3.create(),
			[0, 1, 0, 1],
			8
		);

		const ints = new Int32Array(buffer);
		expect(ints[DRAW.objectId / 4]).toBe(7);
		expect(ints[(stride + DRAW.objectId) / 4]).toBe(8);
	});
});
