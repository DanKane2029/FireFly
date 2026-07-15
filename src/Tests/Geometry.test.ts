import { describe, expect, test } from "@jest/globals";
import { vec3 } from "gl-matrix";
import { Sphere } from "../Geometry/Sphere";
import { Box } from "../Geometry/Box";
import { Ring } from "../Geometry/Ring";
import { Mesh } from "../Geometry/Mesh";
import { VertexBufferLayout, VertexTypes } from "../Renderer/Buffer";

describe("Sphere geometry", () => {
	const detail = 8;
	const mesh = new Sphere(1).calculateMesh(detail);

	// (detail + 1) latitude rings, each with exactly `detail` longitude
	// columns - the seam column is NOT duplicated.
	const vertexCount = (detail + 1) * detail;

	test("has (detail + 1) * detail vertices, no duplicated seam column", () => {
		// 8 floats per vertex (position + normal + texCoord).
		expect(mesh.vertexBuffer.vertices.length).toBe(vertexCount * 8);
	});

	test("UVs run 0..1 across longitude and 0..1 (pole to pole) across latitude", () => {
		const columns = detail;
		// First ring (north pole, theta=0) should have v=0; last ring (south
		// pole, theta=pi) should have v=1. First column (phi=0) should have u=0.
		expect(Array.from(mesh.vertexList[0].textureCoord ?? [])).toEqual([
			0, 0,
		]);
		const lastRingFirstCol = detail * columns; // row `detail`, column 0
		expect(mesh.vertexList[lastRingFirstCol].textureCoord?.[1]).toBeCloseTo(
			1
		);
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

	test("has 24 vertices (4 per face) interleaved as position + normal + texCoord", () => {
		expect(mesh.vertexBuffer.vertices.length).toBe(24 * 8);
	});

	test("has 12 triangles (36 indices)", () => {
		expect(mesh.indexBuffer.indices.length).toBe(36);
	});

	test("every face gets a full [0,1]x[0,1] UV square", () => {
		for (let face = 0; face < 6; face++) {
			const corners = mesh.vertexList
				.slice(face * 4, face * 4 + 4)
				.map((v) => v.textureCoord);
			expect(corners).toEqual([
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0],
			]);
		}
	});
});

describe("Ring geometry", () => {
	const segments = 8;
	const inner = 0.8;
	const outer = 1;
	const mesh = new Ring(inner, outer).calculateMesh(segments);

	// Built double-sided (see Ring.ts's doc comment): 2 faces * segments
	// quads * 4 vertices each, no shared vertices between quads (each corner
	// carries its own flat normal, same reasoning as Box.ts).
	const vertexCount = 2 * segments * 4;

	test("has 2 * segments * 4 vertices (double-sided, 4 per quad)", () => {
		expect(mesh.vertexBuffer.vertices.length).toBe(vertexCount * 8);
	});

	test("has 2 * segments * 2 triangles (double-sided, 2 per quad)", () => {
		expect(mesh.indexBuffer.indices.length).toBe(2 * segments * 2 * 3);
	});

	test("every index refers to a real vertex", () => {
		mesh.indexBuffer.indices.forEach((i) => {
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(vertexCount);
		});
	});

	test("every vertex lies flat in the local z=0 plane", () => {
		mesh.vertexList.forEach((v) => {
			expect(v.position[2]).toBeCloseTo(0);
		});
	});

	test("inner-edge vertices are at the inner radius, outer-edge at the outer radius", () => {
		// Each quad's 4 vertices are pushed as [inner0, outer0, outer1, inner1]
		// (see Ring.ts) - indices 0 and 3 of the first quad are inner-radius,
		// 1 and 2 are outer-radius.
		const innerVertex = mesh.vertexList[0];
		const outerVertex = mesh.vertexList[1];
		expect(vec3.length(innerVertex.position)).toBeCloseTo(inner);
		expect(vec3.length(outerVertex.position)).toBeCloseTo(outer);
	});

	test("the two sides face opposite directions", () => {
		const frontNormal = mesh.vertexList[0].normal;
		const backNormal = mesh.vertexList[segments * 4].normal;
		expect(Array.from(frontNormal ?? [])).toEqual([0, 0, 1]);
		expect(Array.from(backNormal ?? [])).toEqual([0, 0, -1]);
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
