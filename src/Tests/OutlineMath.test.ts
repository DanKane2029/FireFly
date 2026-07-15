import { describe, expect, test } from "@jest/globals";
import { mat4, quat } from "gl-matrix";
import { scaleAboutLocalOrigin } from "../Renderer/OutlineMath";

describe("scaleAboutLocalOrigin", () => {
	test("scales an object at the origin uniformly", () => {
		const identity = mat4.create();
		const scaled = scaleAboutLocalOrigin(identity, 2);

		expect(Array.from(mat4.getScaling([0, 0, 0], scaled))).toEqual([
			2, 2, 2,
		]);
		expect(Array.from(mat4.getTranslation([0, 0, 0], scaled))).toEqual([
			0, 0, 0,
		]);
	});

	test("keeps the pivot fixed for a translated, rotated, non-uniformly-scaled object", () => {
		const rotation = quat.setAxisAngle(quat.create(), [0, 1, 0], Math.PI / 4);
		const transform = mat4.fromRotationTranslationScale(
			mat4.create(),
			rotation,
			[5, 1, -2],
			[2, 3, 4]
		);

		const outlined = scaleAboutLocalOrigin(transform, 1.03);

		// The pivot (translation) must not move - scaling about the LOCAL
		// origin is what keeps an off-center or rotated object's outline
		// centered on the object rather than drifting toward the world origin.
		const translationBefore = mat4.getTranslation([0, 0, 0], transform);
		const translationAfter = mat4.getTranslation([0, 0, 0], outlined);
		expect(translationAfter[0]).toBeCloseTo(translationBefore[0]);
		expect(translationAfter[1]).toBeCloseTo(translationBefore[1]);
		expect(translationAfter[2]).toBeCloseTo(translationBefore[2]);

		// Each local axis's scale grows by exactly the factor, regardless of
		// the object's own rotation.
		const scaleAfter = mat4.getScaling([0, 0, 0], outlined);
		expect(scaleAfter[0]).toBeCloseTo(2 * 1.03);
		expect(scaleAfter[1]).toBeCloseTo(3 * 1.03);
		expect(scaleAfter[2]).toBeCloseTo(4 * 1.03);
	});

	test("a factor of 1 leaves the transform unchanged", () => {
		const rotation = quat.setAxisAngle(quat.create(), [1, 0, 0], 0.5);
		const transform = mat4.fromRotationTranslationScale(
			mat4.create(),
			rotation,
			[1, 2, 3],
			[1, 1, 1]
		);

		const unchanged = scaleAboutLocalOrigin(transform, 1);

		for (let i = 0; i < 16; i++) {
			expect(unchanged[i]).toBeCloseTo(transform[i]);
		}
	});
});
