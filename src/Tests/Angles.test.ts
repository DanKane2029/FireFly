import { describe, expect, test } from "@jest/globals";
import { vec3 } from "gl-matrix";
import { projectOntoPlane, signedAngleAroundAxis } from "../Math/Angles";

describe("projectOntoPlane", () => {
	test("a vector already in the plane is unchanged", () => {
		const result = projectOntoPlane([1, 0, 0], [0, 1, 0]);
		expect(Array.from(result)).toEqual([1, 0, 0]);
	});

	test("a vector entirely along the normal projects to zero", () => {
		const result = projectOntoPlane([0, 5, 0], [0, 1, 0]);
		expect(result[0]).toBeCloseTo(0);
		expect(result[1]).toBeCloseTo(0);
		expect(result[2]).toBeCloseTo(0);
	});

	test("strips just the along-normal component of a mixed vector", () => {
		const result = projectOntoPlane([1, 5, 0], [0, 1, 0]);
		expect(result[0]).toBeCloseTo(1);
		expect(result[1]).toBeCloseTo(0);
		expect(result[2]).toBeCloseTo(0);
	});
});

describe("signedAngleAroundAxis", () => {
	test("a +90 degree rotation around Y", () => {
		// Right-hand rule about +Y: +X rotates toward -Z.
		const radians = signedAngleAroundAxis([0, 1, 0], [1, 0, 0], [0, 0, -1]);
		expect((radians * 180) / Math.PI).toBeCloseTo(90);
	});

	test("a -90 degree rotation around Y", () => {
		const radians = signedAngleAroundAxis([0, 1, 0], [1, 0, 0], [0, 0, 1]);
		expect((radians * 180) / Math.PI).toBeCloseTo(-90);
	});

	test("a 180 degree rotation around Z", () => {
		const radians = signedAngleAroundAxis([0, 0, 1], [1, 0, 0], [-1, 0, 0]);
		expect((radians * 180) / Math.PI).toBeCloseTo(180);
	});

	test("the same direction is a zero-degree rotation", () => {
		const radians = signedAngleAroundAxis([1, 0, 0], [0, 1, 0], [0, 1, 0]);
		expect(radians).toBeCloseTo(0);
	});

	test("is robust to from/to vectors that aren't already perfectly coplanar", () => {
		// Both have a component along the [0,1,0] axis itself, which should
		// be projected out rather than corrupting the measurement.
		const radians = signedAngleAroundAxis(
			[0, 1, 0],
			[1, 0.5, 0],
			[0, 0.3, -1]
		);
		expect((radians * 180) / Math.PI).toBeCloseTo(90);
	});

	test("a full quarter-turn matches vec3-normalized inputs too", () => {
		const from = vec3.fromValues(2, 0, 0); // not normalized
		const to = vec3.fromValues(0, 0, -3); // not normalized
		const radians = signedAngleAroundAxis([0, 1, 0], from, to);
		expect((radians * 180) / Math.PI).toBeCloseTo(90);
	});
});
