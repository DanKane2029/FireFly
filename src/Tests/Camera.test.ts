import { vec3 } from "gl-matrix";
import { describe, expect, test } from "@jest/globals";
import { Camera } from "../Renderer/Camera";

/**
 * The view matrix moves world points into the camera's frame, where the camera
 * sits at the origin looking down -Z. So a point the camera is aimed at should
 * land on the -Z axis at a distance equal to how far the camera is from it.
 */
function targetInViewSpace(cameraPos: vec3): vec3 {
	const camera = new Camera(1, 45, 0.01, 1000);
	camera.translation = cameraPos;
	camera.lookAt([0, 0, 0]);
	return vec3.transformMat4(vec3.create(), [0, 0, 0], camera.viewMatrix);
}

describe("Camera lookAt", () => {
	test("puts the target straight ahead down -Z", () => {
		const p = targetInViewSpace([0, 0, 2]);
		expect(p[0]).toBeCloseTo(0, 5);
		expect(p[1]).toBeCloseTo(0, 5);
		expect(p[2]).toBeCloseTo(-2, 5);
	});

	test("aims correctly from the side", () => {
		const p = targetInViewSpace([3, 0, 0]);
		expect(p[0]).toBeCloseTo(0, 5);
		expect(p[1]).toBeCloseTo(0, 5);
		expect(p[2]).toBeCloseTo(-3, 5);
	});

	test("has no singularity looking straight down the world-up axis", () => {
		// Camera directly above the target: the view direction is parallel to
		// the default up hint, which used to produce a degenerate (NaN) basis.
		const p = targetInViewSpace([0, 4, 0]);
		expect(Number.isNaN(p[2])).toBe(false);
		expect(p[0]).toBeCloseTo(0, 5);
		expect(p[1]).toBeCloseTo(0, 5);
		expect(p[2]).toBeCloseTo(-4, 5);
	});

	test("has no singularity looking straight up from below", () => {
		const p = targetInViewSpace([0, -4, 0]);
		expect(Number.isNaN(p[2])).toBe(false);
		expect(p[2]).toBeCloseTo(-4, 5);
	});
});
