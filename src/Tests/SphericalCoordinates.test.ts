import { describe, expect, test } from "@jest/globals";
import {
	SphericalCoord,
	toCatesianCoord,
	toSphericalCoord,
} from "../Math/SphericalCoordinates";
import { vec3 } from "gl-matrix";

const PI = Math.PI;

/**
 * Tests if two spherical coordinates are equal
 *
 * @param sc1 - The first sperical coordinate
 * @param sc2 - The second spherical coordinate
 */
function sphericalCoordsEqual(sc1: SphericalCoord, sc2: SphericalCoord) {
	expect(sc1.radius).toBeCloseTo(sc2.radius);
	expect(sc1.theta).toBeCloseTo(sc2.theta);
	expect(sc1.phi).toBeCloseTo(sc2.phi);
}

/**
 * Tests if two cartesian coordinates are equal
 *
 * @param cc1 - The first cartesian coordinate
 * @param cc2 - The second cartesian coordinate
 */
function cartesianCoordsEqual(cc1: vec3, cc2: vec3) {
	expect(cc1[0]).toBeCloseTo(cc2[0]);
	expect(cc1[1]).toBeCloseTo(cc2[1]);
	expect(cc1[2]).toBeCloseTo(cc2[2]);
}

describe("Cartesian to Spherical Coordinate Tests", () => {
	test("Cartesian coordinate (1, 0, 0) should be spherical coord {radius=1, theta=PI/2, phi=0}", () => {
		const cc = vec3.fromValues(1, 0, 0);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 2, phi: 0 });
	});
	test("Cartesian coordinate (-1, 0, 0) should be spherical coord {radius=1, theta=PI/2, phi=PI}", () => {
		const cc = vec3.fromValues(-1, 0, 0);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 2, phi: PI });
	});
	test("Cartesian coordinate (0, 1, 0) should be spherical coord {radius=1, theta=PI/2, phi=PI/2}", () => {
		const cc = vec3.fromValues(0, 1, 0);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 2, phi: PI / 2 });
	});
	test("Cartesian coordinate (0, -1, 0) should be spherical coord {radius=1, theta=PI/2, phi=-PI/2}", () => {
		const cc = vec3.fromValues(0, -1, 0);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 2, phi: -PI / 2 });
	});
	test("Cartesian coordinate (0, 0, 1) should be spherical coord {radius=1, theta=0, phi=0}", () => {
		const cc = vec3.fromValues(0, 0, 1);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: 0, phi: 0 });
	});
	test("Cartesian coordinate (0, 0, -1) should be spherical coord {radius=1, theta=PI, phi=0}", () => {
		const cc = vec3.fromValues(0, 0, -1);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI, phi: 0 });
	});
	test("Cartesian coordinate (0.5, 0.5, 0.7071) should be spherical coord {radius=1, theta=PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(0.5, 0.5, 0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 4, phi: PI / 4 });
	});
	test("Cartesian coordinate (0.5, -0.5, 0.7071) should be spherical coord {radius=1, theta=PI/4, phi=-PI/4}", () => {
		const cc = vec3.fromValues(0.5, -0.5, 0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, { radius: 1, theta: PI / 4, phi: -PI / 4 });
	});
	test("Cartesian coordinate (-0.5, -0.5, 0.7071) should be spherical coord {radius=1, theta=-3*PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(-0.5, -0.5, 0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: PI / 4,
			phi: (-3 * PI) / 4,
		});
	});
	test("Cartesian coordinate (-0.5, 0.5, 0.7071) should be spherical coord {radius=1, theta=-PI/4, phi=-PI/4}", () => {
		const cc = vec3.fromValues(-0.5, 0.5, 0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: PI / 4,
			phi: (3 * PI) / 4,
		});
	});
	test("Cartesian coordinate (0.5, 0.5, -0.7071) should be spherical coord {radius=1, theta=3*PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(0.5, 0.5, -0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: PI / 4,
		});
	});
	test("Cartesian coordinate (0.5, -0.5, -0.7071) should be spherical coord {radius=1, theta=3*PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(0.5, -0.5, -0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: -PI / 4,
		});
	});
	test("Cartesian coordinate (-0.5, 0.5, -0.7071) should be spherical coord {radius=1, theta=3*PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(-0.5, 0.5, -0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: (3 * PI) / 4,
		});
	});
	test("Cartesian coordinate (-0.5, -0.5, -0.7071) should be spherical coord {radius=1, theta=3*PI/4, phi=PI/4}", () => {
		const cc = vec3.fromValues(-0.5, -0.5, -0.7071);
		const sc = toSphericalCoord(cc);
		sphericalCoordsEqual(sc, {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: -(3 * PI) / 4,
		});
	});
});

describe("Spherical to Cartesian Coordinate Tests", () => {
	test("Spherical coordinate {radius=1, theta=PI/2, phi=0} should be cartesian coordinate (1, 0, 0)", () => {
		const sc: SphericalCoord = { radius: 1, theta: PI / 2, phi: 0 };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(1, 0, 0));
	});
	test("Spherical coordinate {radius=1, theta=PI/2, phi=PI} should be cartesian coordinate (-1, 0, 0)", () => {
		const sc: SphericalCoord = { radius: 1, theta: PI / 2, phi: PI };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(-1, 0, 0));
	});
	test("Spherical coordinate {radius=1, theta=PI/2, phi=PI/2} should be cartesian coordinate (0, 1, 0)", () => {
		const sc: SphericalCoord = { radius: 1, theta: PI / 2, phi: PI / 2 };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0, 1, 0));
	});
	test("Spherical coordinate {radius=1, theta=PI/2, phi=-PI/2} should be cartesian coordinate (0, -1, 0)", () => {
		const sc: SphericalCoord = { radius: 1, theta: PI / 2, phi: -PI / 2 };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0, -1, 0));
	});
	test("Spherical coordinate {radius=1, theta=0, phi=0} should be cartesian coordinate (0, 0, 1)", () => {
		const sc: SphericalCoord = { radius: 1, theta: 0, phi: 0 };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0, 0, 1));
	});
	test("Spherical coordinate {radius=1, theta=PI, phi=0} should be cartesian coordinate (0, 0, -1)", () => {
		const sc: SphericalCoord = { radius: 1, theta: PI, phi: 0 };
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0, 0, -1));
	});
	test("Spherical coordinate {radius=1, theta=3*PI/4, phi=PI/4} should be cartesian coordinate (0.5, 0.5, -0.7071)", () => {
		const sc: SphericalCoord = {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: PI / 4,
		};
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0.5, 0.5, -0.7071));
	});
	test("Spherical coordinate {radius=1, theta=3*PI/4, phi=-PI/4} should be cartesian coordinate (0.5, -0.5, -0.7071)", () => {
		const sc: SphericalCoord = {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: -PI / 4,
		};
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(0.5, -0.5, -0.7071));
	});
	test("Spherical coordinate {radius=1, theta=3*PI/4, phi=-PI/4} should be cartesian coordinate (-0.5, 0.5, -0.7071)", () => {
		const sc: SphericalCoord = {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: (3 * PI) / 4,
		};
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(-0.5, 0.5, -0.7071));
	});
	test("Spherical coordinate {radius=1, theta=3*PI/4, phi=-PI/4} should be cartesian coordinate (-0.5, -0.5, -0.7071)", () => {
		const sc: SphericalCoord = {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: (-3 * PI) / 4,
		};
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(-0.5, -0.5, -0.7071));
	});
	test("Spherical coordinate {radius=1, theta=2 * PI, phi=0} should be cartesian coordinate (-0.5, -0.5, -0.7071)", () => {
		const sc: SphericalCoord = {
			radius: 1,
			theta: (3 * PI) / 4,
			phi: (-3 * PI) / 4,
		};
		const cc = toCatesianCoord(sc);
		cartesianCoordsEqual(cc, vec3.fromValues(-0.5, -0.5, -0.7071));
	});
});
