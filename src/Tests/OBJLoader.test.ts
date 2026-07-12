import { describe, expect, test } from "@jest/globals";
import { parseOBJ } from "../Geometry/OBJLoader";

// A unit cube spanning [0,1]^3, given as six quad faces. The loader should
// dedupe the shared corners down to 8 vertices, fan-triangulate the quads into
// 12 triangles, and compute a smooth normal at every vertex.
const CUBE_OBJ = `
# a little cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
`;

const STRIDE = 6; // a_position (3) + a_normal (3)

describe("parseOBJ", () => {
	const mesh = parseOBJ(CUBE_OBJ);

	test("dedupes shared corners to one vertex per position", () => {
		expect(mesh.vertexBuffer.vertices.length).toBe(8 * STRIDE);
	});

	test("fan-triangulates the six quads into 12 triangles", () => {
		expect(mesh.indexBuffer.indices.length).toBe(12 * 3);
	});

	test("every index refers to a real vertex", () => {
		mesh.indexBuffer.indices.forEach((i) => {
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(8);
		});
	});

	test("computes unit-length normals for a file with none", () => {
		const data = mesh.vertexBuffer.vertices;
		for (let v = 0; v < 8; v++) {
			const nx = data[v * STRIDE + 3];
			const ny = data[v * STRIDE + 4];
			const nz = data[v * STRIDE + 5];
			expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
		}
	});

	test("centers and scales the mesh into a unit box", () => {
		const data = mesh.vertexBuffer.vertices;
		let min = Infinity;
		let max = -Infinity;
		for (let v = 0; v < 8; v++) {
			for (let axis = 0; axis < 3; axis++) {
				const value = data[v * STRIDE + axis];
				min = Math.min(min, value);
				max = Math.max(max, value);
			}
		}
		// A cube's longest axis is normalized to span 1, centered on the origin.
		expect(min).toBeCloseTo(-0.5, 5);
		expect(max).toBeCloseTo(0.5, 5);
	});
});

describe("parseOBJ face-index handling", () => {
	// Two triangles sharing an edge, written with the full v/vt/vn corner form,
	// a negative position index, and explicit normals. The loader should honor
	// the stored normals rather than computing its own.
	const OBJ = `
v -1 0 0
v 1 0 0
v 0 1 0
vt 0 0
vn 0 0 1
f 1/1/1 2/1/1 3/1/1
f 1/1/1 -1/1/1 2/1/1
`;

	test("parses v/vt/vn corners and negative indices without error", () => {
		const mesh = parseOBJ(OBJ);
		expect(mesh.indexBuffer.indices.length).toBe(2 * 3);
	});

	test("uses normals from the file when present", () => {
		const mesh = parseOBJ(OBJ);
		const data = mesh.vertexBuffer.vertices;
		const stride = STRIDE;
		// The stored normal is (0,0,1) for every corner.
		for (let v = 0; v < data.length / stride; v++) {
			expect(data[v * stride + 3]).toBeCloseTo(0, 5);
			expect(data[v * stride + 4]).toBeCloseTo(0, 5);
			expect(data[v * stride + 5]).toBeCloseTo(1, 5);
		}
	});
});
