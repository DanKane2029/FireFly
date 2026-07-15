import { describe, expect, test } from "@jest/globals";
import { mat4, vec3 } from "gl-matrix";
import {
	closestPointOnLineToRay,
	intersectRayPlane,
	screenPointToWorldRay,
} from "../Math/Ray";
import { Camera } from "../Renderer/Camera";

describe("closestPointOnLineToRay", () => {
	test("a ray perpendicular to the line finds the point directly below it", () => {
		// The X axis, and a ray parallel to Z passing through x=2 - the
		// closest point on the line has to be (2,0,0).
		const point = closestPointOnLineToRay(
			vec3.fromValues(0, 0, 0),
			vec3.fromValues(1, 0, 0),
			{
				origin: vec3.fromValues(2, 0, -5),
				direction: vec3.fromValues(0, 0, 1),
			}
		);
		expect(point[0]).toBeCloseTo(2);
		expect(point[1]).toBeCloseTo(0);
		expect(point[2]).toBeCloseTo(0);
	});

	test("a ray that actually intersects the line finds the intersection", () => {
		// The X axis, and a ray starting off-axis but aimed straight at (3,0,0).
		const point = closestPointOnLineToRay(
			vec3.fromValues(0, 0, 0),
			vec3.fromValues(1, 0, 0),
			{
				origin: vec3.fromValues(3, 5, 0),
				direction: vec3.normalize(
					vec3.create(),
					vec3.fromValues(0, -1, 0)
				),
			}
		);
		expect(point[0]).toBeCloseTo(3);
		expect(point[1]).toBeCloseTo(0);
		expect(point[2]).toBeCloseTo(0);
	});

	test("a line offset from the origin still resolves correctly", () => {
		// A line through (0,5,0) running along Z, and a ray straight down the
		// Y axis at z=4 - closest point should be (0,5,4).
		const point = closestPointOnLineToRay(
			vec3.fromValues(0, 5, 0),
			vec3.fromValues(0, 0, 1),
			{
				origin: vec3.fromValues(0, 20, 4),
				direction: vec3.fromValues(0, -1, 0),
			}
		);
		expect(point[0]).toBeCloseTo(0);
		expect(point[1]).toBeCloseTo(5);
		expect(point[2]).toBeCloseTo(4);
	});

	test("a ray parallel to the line doesn't blow up (falls back to the line's own origin)", () => {
		const lineOrigin = vec3.fromValues(1, 2, 3);
		const point = closestPointOnLineToRay(
			lineOrigin,
			vec3.fromValues(1, 0, 0),
			{
				origin: vec3.fromValues(0, 0, 0),
				direction: vec3.fromValues(1, 0, 0),
			}
		);
		expect(Array.from(point)).toEqual(Array.from(lineOrigin));
	});
});

describe("screenPointToWorldRay", () => {
	function testCamera(): Camera {
		const camera = new Camera(1, 60, 0.1, 100);
		camera.translation = vec3.fromValues(0, 0, 5);
		camera.lookAt([0, 0, 0]);
		return camera;
	}

	test("the center of the screen rays straight down the camera's view direction", () => {
		const camera = testCamera();
		const ray = screenPointToWorldRay(
			camera.perspectiveMatrix,
			camera.viewMatrix,
			0,
			0
		);
		// Camera looks from (0,0,5) at the origin, i.e. straight down -Z.
		expect(ray.direction[0]).toBeCloseTo(0);
		expect(ray.direction[1]).toBeCloseTo(0);
		expect(ray.direction[2]).toBeCloseTo(-1);
	});

	test("the ray's origin is on the camera's near plane, in front of the camera", () => {
		const camera = testCamera();
		const ray = screenPointToWorldRay(
			camera.perspectiveMatrix,
			camera.viewMatrix,
			0,
			0
		);
		// Near the camera (z=5) but already slightly into -Z (the near plane
		// is at z=5-0.1=4.9), and not out at the far plane (z would be ~-95).
		expect(ray.origin[2]).toBeLessThan(5);
		expect(ray.origin[2]).toBeGreaterThan(4);
	});

	test("a point known to be visible on screen lies on its own unprojected ray", () => {
		const camera = testCamera();
		const worldPoint = vec3.fromValues(0.5, -0.3, 0);

		// Project worldPoint to NDC by hand (the forward direction), then
		// unproject that NDC point back to a ray and confirm worldPoint lies
		// on it - a round trip through the two ends of the same pipeline.
		const viewProjection = mat4.multiply(
			mat4.create(),
			camera.perspectiveMatrix,
			camera.viewMatrix
		);
		const clip = vec3.transformMat4(
			vec3.create(),
			worldPoint,
			viewProjection
		);
		// vec3.transformMat4 in gl-matrix already divides by w for a
		// perspective matrix, so `clip` here is already NDC.
		const ray = screenPointToWorldRay(
			camera.perspectiveMatrix,
			camera.viewMatrix,
			clip[0],
			clip[1]
		);

		// Point-to-line distance: |cross(worldPoint - ray.origin, direction)|,
		// since direction is a unit vector. Using closestPointOnLineToRay here
		// (with worldPoint as "the line", direction as the ray's own
		// direction) would be degenerate - the two directions would be
		// parallel by construction, always short-circuiting to "no movement".
		const toPoint = vec3.subtract(vec3.create(), worldPoint, ray.origin);
		const distanceToRay = vec3.length(
			vec3.cross(vec3.create(), toPoint, ray.direction)
		);
		expect(distanceToRay).toBeCloseTo(0, 4);
	});
});

describe("intersectRayPlane", () => {
	test("a ray straight down at the XY plane hits the origin", () => {
		const point = intersectRayPlane(
			{
				origin: vec3.fromValues(0, 0, 5),
				direction: vec3.fromValues(0, 0, -1),
			},
			vec3.fromValues(0, 0, 0),
			vec3.fromValues(0, 0, 1)
		);
		expect(point).not.toBeNull();
		expect(point?.[0]).toBeCloseTo(0);
		expect(point?.[1]).toBeCloseTo(0);
		expect(point?.[2]).toBeCloseTo(0);
	});

	test("hits a plane through a non-origin point at an angle", () => {
		const point = intersectRayPlane(
			{
				origin: vec3.fromValues(2, 5, 0),
				direction: vec3.normalize(
					vec3.create(),
					vec3.fromValues(0, -1, 0)
				),
			},
			vec3.fromValues(0, 1, 0),
			vec3.fromValues(0, 1, 0)
		);
		expect(point).not.toBeNull();
		expect(point?.[0]).toBeCloseTo(2);
		expect(point?.[1]).toBeCloseTo(1);
		expect(point?.[2]).toBeCloseTo(0);
	});

	test("a ray parallel to the plane returns null", () => {
		const point = intersectRayPlane(
			{
				origin: vec3.fromValues(0, 5, 0),
				direction: vec3.fromValues(1, 0, 0),
			},
			vec3.fromValues(0, 0, 0),
			vec3.fromValues(0, 1, 0)
		);
		expect(point).toBeNull();
	});

	test("a plane entirely behind the ray's origin returns null", () => {
		const point = intersectRayPlane(
			{
				origin: vec3.fromValues(0, 0, 0),
				direction: vec3.fromValues(0, 0, 1),
			},
			vec3.fromValues(0, 0, -5),
			vec3.fromValues(0, 0, 1)
		);
		expect(point).toBeNull();
	});
});
