import { describe, expect, test } from "@jest/globals";
import { mat4, vec3 } from "gl-matrix";
import {
	TransformData,
	createTransform,
	transformFromMatrix,
	transformMatrix,
} from "../ecs/components/Transform";

/** transformMatrix -> transformFromMatrix -> transformMatrix should produce
 * an equivalent matrix, even though the intermediate TransformData isn't
 * necessarily byte-identical to the original (Euler angles aren't unique). */
function expectMatricesClose(a: mat4, b: mat4, precision = 4) {
	for (let i = 0; i < 16; i++) {
		expect(a[i]).toBeCloseTo(b[i], precision);
	}
}

describe("transformFromMatrix (the glTF loader's node-flattening primitive)", () => {
	test("round-trips translation, rotation, and uniform scale through a matrix", () => {
		const original: TransformData = createTransform({
			translation: [1, -2, 3.5],
			rotation: [15, -40, 70],
			scale: [2, 2, 2],
		});

		const matrix = transformMatrix(original, mat4.create());
		const decomposed = transformFromMatrix(matrix);
		const reconstructed = transformMatrix(decomposed, mat4.create());

		expectMatricesClose(matrix, reconstructed);
		[1, -2, 3.5].forEach((v, i) =>
			expect(decomposed.translation[i]).toBeCloseTo(v, 4)
		);
		[2, 2, 2].forEach((v, i) => expect(decomposed.scale[i]).toBeCloseTo(v, 4));
	});

	test("round-trips translation and non-uniform scale with no rotation", () => {
		// Non-uniform scale is only exact when it isn't combined with rotation
		// (see transformFromMatrix's doc comment) - this is the other half of
		// that boundary, the case that IS exact.
		const original: TransformData = createTransform({
			translation: [1, -2, 3.5],
			scale: [2, 0.5, 1],
		});

		const matrix = transformMatrix(original, mat4.create());
		const decomposed = transformFromMatrix(matrix);
		const reconstructed = transformMatrix(decomposed, mat4.create());

		expectMatricesClose(matrix, reconstructed);
		[2, 0.5, 1].forEach((v, i) => expect(decomposed.scale[i]).toBeCloseTo(v, 4));
	});

	test("round-trips across many random angles, away from gimbal lock", () => {
		for (let i = 0; i < 200; i++) {
			const original: TransformData = createTransform({
				translation: vec3.fromValues(
					Math.random() * 10 - 5,
					Math.random() * 10 - 5,
					Math.random() * 10 - 5
				),
				// Keep pitch away from +-90deg, where the decomposition is
				// inherently ambiguous (see transformFromMatrix's doc comment).
				rotation: vec3.fromValues(
					Math.random() * 340 - 170,
					Math.random() * 170 - 85,
					Math.random() * 340 - 170
				),
				scale: vec3.fromValues(1, 1, 1), // uniform: exact even with rotation
			});

			const matrix = transformMatrix(original, mat4.create());
			const decomposed = transformFromMatrix(matrix);
			const reconstructed = transformMatrix(decomposed, mat4.create());

			expectMatricesClose(matrix, reconstructed, 3);
		}
	});

	test("identity matrix decomposes to the default transform", () => {
		const decomposed = transformFromMatrix(mat4.create());
		expect(Array.from(decomposed.translation)).toEqual([0, 0, 0]);
		expect(Array.from(decomposed.scale)).toEqual([1, 1, 1]);
		// toBeCloseTo (not toEqual) - atan2 can return -0 for a zero-rotation
		// matrix depending on floating-point noise, which is a meaningless
		// distinction (-0 === 0) but would fail a strict deep-equality check.
		decomposed.rotation.forEach((v) => expect(v).toBeCloseTo(0));
	});

	test("a pure translation decomposes with no rotation and unit scale", () => {
		const m = mat4.create();
		mat4.translate(m, m, [5, -3, 2]);
		const decomposed = transformFromMatrix(m);
		expect(Array.from(decomposed.translation)).toEqual([5, -3, 2]);
		expect(Array.from(decomposed.scale)).toEqual([1, 1, 1]);
	});
});
