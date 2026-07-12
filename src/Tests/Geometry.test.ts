import { describe, expect, test } from "@jest/globals";
import { Sphere } from "../Geometry/Sphere";
import { Box } from "../Geometry/Box";
import { Mesh } from "../Geometry/Mesh";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";

describe("Sphere geometry", () => {
	const detail = 8;
	const mesh = new Sphere(1).calculateMesh(detail);

	// (detail + 1) latitude rings, each with exactly `detail` longitude
	// columns - the seam column is NOT duplicated.
	const vertexCount = (detail + 1) * detail;

	test("has (detail + 1) * detail vertices, no duplicated seam column", () => {
		// 6 floats per vertex (position + normal).
		expect(mesh.vertexBuffer.vertices.length).toBe(vertexCount * 6);
	});

	test("every index refers to a real vertex", () => {
		mesh.indexBuffer.indices.forEach((i) => {
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(vertexCount);
		});
	});

	test("closes the seam by wrapping the last column back to the first", () => {
		const indices = mesh.indexBuffer.indices;
		let wraps = false;
		for (let k = 0; k < indices.length; k += 3) {
			const columns = [
				indices[k] % detail,
				indices[k + 1] % detail,
				indices[k + 2] % detail,
			];
			if (columns.includes(0) && columns.includes(detail - 1)) {
				wraps = true;
				break;
			}
		}
		expect(wraps).toBe(true);
	});
});

describe("Box geometry", () => {
	const mesh = new Box([2, 2, 2]).calculateMesh();

	test("has 24 vertices (4 per face) interleaved as position + normal", () => {
		expect(mesh.vertexBuffer.vertices.length).toBe(24 * 6);
	});

	test("has 12 triangles (36 indices)", () => {
		expect(mesh.indexBuffer.indices.length).toBe(36);
	});
});

describe("Mesh interleaving", () => {
	test("throws when the layout needs data a vertex does not have", () => {
		const layout = new VertexBufferLayout([
			{
				name: "a_position",
				size: 3,
				type: VertexTypes.FLOAT,
				normalized: false,
			},
			{
				name: "a_color",
				size: 4,
				type: VertexTypes.FLOAT,
				normalized: false,
			},
		]);

		// The vertex has a position but no color, so interleaving must fail
		// loudly rather than silently dropping the missing attribute.
		expect(
			() => new Mesh([{ position: [0, 0, 0] }], [[0]], layout)
		).toThrow(/a_color/);
	});
});
