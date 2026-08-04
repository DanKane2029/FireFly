import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { mat4, vec4 } from "gl-matrix";

import { MAX_LIGHTS } from "../Renderer/RenderBackend";
import { ATTRIBUTE_LOCATIONS, attributeLocation } from "../Renderer/attributeLocations";
import { CLIP_SPACE_CORRECTION, alignTo } from "../Renderer/webgpu/WebGPUBackend";
import { standardVertexLayout } from "../Renderer/Buffer";
import { vertexBufferLayoutFor } from "../Renderer/webgpu/PipelineCache";

const SHADERS = join(__dirname, "..", "Shaders");

function shaderSource(...parts: string[]): string {
	return readFileSync(join(SHADERS, ...parts), "utf8");
}

/**
 * Firefly's GLSL and WGSL shaders are hand-written twins - nothing generates
 * one from the other, so nothing stops them drifting apart either. These tests
 * pin the specific facts that have to hold across both languages and both
 * backends, which is exactly the drift a reader would otherwise only discover
 * by seeing the scene render wrong in one API and right in the other.
 */
describe("shader / backend agreement", () => {
	test("MAX_LIGHTS is the same in TypeScript, GLSL, and WGSL", () => {
		const glsl = shaderSource("Lighting.frag.glsl");
		const wgsl = shaderSource("wgsl", "Lighting.wgsl");

		const glslMatch = glsl.match(/#define\s+MAX_LIGHTS\s+(\d+)/);
		const wgslMatch = wgsl.match(/const\s+MAX_LIGHTS\s*:\s*u32\s*=\s*(\d+)u/);

		expect(glslMatch).not.toBeNull();
		expect(wgslMatch).not.toBeNull();
		expect(Number(glslMatch?.[1])).toBe(MAX_LIGHTS);
		expect(Number(wgslMatch?.[1])).toBe(MAX_LIGHTS);
		// Unlit.wgsl repeats the array size inline (WGSL has no includes), so
		// it has to track MAX_LIGHTS too.
		expect(shaderSource("wgsl", "Unlit.wgsl")).toContain(
			`array<vec4f, ${MAX_LIGHTS}>`
		);
	});

	test("WGSL @location numbers match the shared attribute table", () => {
		const wgsl = shaderSource("wgsl", "Lighting.wgsl");

		// The lit shader reads all three attributes, each at the slot
		// attributeLocations.ts assigns and the WebGL backend binds by name.
		expect(wgsl).toMatch(
			new RegExp(`@location\\(${ATTRIBUTE_LOCATIONS.a_position}\\)\\s+position`)
		);
		expect(wgsl).toMatch(
			new RegExp(`@location\\(${ATTRIBUTE_LOCATIONS.a_normal}\\)\\s+normal`)
		);
		expect(wgsl).toMatch(
			new RegExp(`@location\\(${ATTRIBUTE_LOCATIONS.a_texCoord}\\)\\s+texCoord`)
		);
	});

	test("every attribute the GLSL shaders declare has a pinned location", () => {
		["Lighting.vert.glsl", "Unlit.vert.glsl"].forEach((file) => {
			const declared = shaderSource(file).matchAll(
				/^\s*in\s+\w+\s+(a_\w+)\s*;/gm
			);
			for (const [, name] of declared) {
				// Throws if the name is missing from the table, which is the
				// failure being guarded against.
				expect(typeof attributeLocation(name)).toBe("number");
			}
		});
	});

	test("attributeLocation rejects an unknown attribute instead of silently returning -1", () => {
		expect(() => attributeLocation("a_tangent")).toThrow(
			/Unknown vertex attribute/
		);
	});

	test("the standard layout supplies every location the lit shader declares", () => {
		const layout = vertexBufferLayoutFor(standardVertexLayout());
		// GPUVertexBufferLayout types `attributes` as a bare Iterable.
		const attributes = Array.from(layout.attributes);
		const supplied = attributes.map(
			(attribute) => attribute.shaderLocation
		);

		// WebGPU rejects a pipeline whose shader reads a location the vertex
		// state doesn't provide - this is why meshes without real UVs carry
		// zeroed ones rather than a shorter layout.
		expect(supplied).toEqual([0, 1, 2]);
		// Interleaved: 3 + 3 + 2 floats.
		expect(layout.arrayStride).toBe(32);
		expect(attributes.map((a) => a.offset)).toEqual([0, 12, 24]);
	});
});

describe("WebGPU clip space", () => {
	test("maps an OpenGL projection's depth range onto WebGPU's", () => {
		const near = 0.1;
		const far = 100;
		const projection = mat4.perspective(mat4.create(), 1, 1, near, far);
		const corrected = mat4.multiply(
			mat4.create(),
			CLIP_SPACE_CORRECTION,
			projection
		);

		const depthAt = (distance: number): number => {
			// A point straight ahead, `distance` in front of the camera.
			const clip = vec4.transformMat4(
				vec4.create(),
				[0, 0, -distance, 1],
				corrected
			);
			return clip[2] / clip[3];
		};

		// Without the correction these would be -1 and +1, and WebGPU would
		// clip away everything in the near half of the view volume.
		expect(depthAt(near)).toBeCloseTo(0, 5);
		expect(depthAt(far)).toBeCloseTo(1, 5);
		// Still monotonic in between, so depth testing behaves.
		expect(depthAt(1)).toBeGreaterThan(depthAt(0.5));
	});

	test("leaves x and y untouched", () => {
		const point = vec4.transformMat4(
			vec4.create(),
			[3, -4, 5, 1],
			CLIP_SPACE_CORRECTION
		);
		expect(point[0]).toBe(3);
		expect(point[1]).toBe(-4);
	});
});

describe("readback alignment", () => {
	test("rounds a row up to WebGPU's 256-byte copy boundary", () => {
		// copyTextureToBuffer refuses anything else; the padding is stripped
		// again on the way out (see readTargetPixels).
		expect(alignTo(4, 256)).toBe(256);
		expect(alignTo(256, 256)).toBe(256);
		expect(alignTo(257, 256)).toBe(512);
		// A 300px-wide image is 1200 bytes per row, padded to 1280.
		expect(alignTo(300 * 4, 256)).toBe(1280);
	});
});
