import { mat4, quat, vec3 } from "gl-matrix";
import { Renderable } from "./Renderer";
import { Material, MaterialPropertyType } from "./Material";
import { Box } from "../Geometry/Box";
import { litProgram } from "../ecs/prefabs";
import {
	AXIS_VECTORS,
	GIZMO_AXIS_IDS,
	GizmoAxis,
	axisIndex,
	worldSizeForDistance,
} from "./GizmoAxis";

/**
 * Builds the draggable translation handles drawn over the selected object:
 * three thin bars along X (red), Y (green), and Z (blue). Reuses GPU picking
 * (see Picker.ts) rather than any CPU-side hit testing - each handle is
 * drawn into the id-texture like any other Renderable, just with a small
 * reserved id (GizmoAxis.ts) instead of an entity id, and through an overlay
 * pass (see Renderer.render) so it's always visible on top of the scene it's
 * manipulating.
 *
 * Pulls in prefabs.ts for the shared lit shader program, which makes this
 * file - like Renderer.ts itself - untestable under Jest (no GL context, and
 * prefabs.ts's webpack-only .glsl imports Jest can't transform either). The
 * id/axis/sizing math this depends on is factored out into GizmoAxis.ts
 * specifically so *that* half stays unit-testable.
 */

const HANDLE_THICKNESS_FRACTION = 0.06; // relative to the handle's own length

// A unit cube (spans [-0.5, 0.5] on every axis), shared by all three handles -
// each is just this box scaled long on its own axis and short on the other
// two, then offset so it starts at the origin instead of straddling it (see
// buildGizmoRenderables). One shared Mesh, matching the module-singleton
// pattern prefabs.ts already uses for the built-in geometry.
const handleMesh = new Box(vec3.fromValues(1, 1, 1)).calculateMesh();

const handleMaterials: Record<GizmoAxis, Material> = {
	x: new Material("Gizmo X", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.9, 0.2, 0.2, 1],
		},
	]),
	y: new Material("Gizmo Y", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.2, 0.9, 0.2, 1],
		},
	]),
	z: new Material("Gizmo Z", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.2, 0.4, 0.9, 1],
		},
	]),
};

/**
 * Builds the three axis-handle Renderables for a gizmo centered at
 * `position`, sized relative to `cameraPosition`'s distance from it.
 */
export function buildGizmoRenderables(
	position: vec3,
	cameraPosition: vec3
): Renderable[] {
	const length = worldSizeForDistance(
		vec3.distance(position, cameraPosition)
	);
	const thickness = length * HANDLE_THICKNESS_FRACTION;

	return (Object.keys(AXIS_VECTORS) as GizmoAxis[]).map((axis) => {
		const axisVec = AXIS_VECTORS[axis];

		// Scale: `length` long on this axis, `thickness` on the other two.
		const scale = vec3.fromValues(thickness, thickness, thickness);
		scale[axisIndex(axis)] = length;

		// The unit box is centered at the origin; offset by half its length
		// along the axis so it starts at `position` and extends outward,
		// rather than straddling it.
		const localOffset = vec3.scale(vec3.create(), axisVec, length / 2);
		const translation = vec3.add(vec3.create(), position, localOffset);

		const transform = mat4.fromRotationTranslationScale(
			mat4.create(),
			quat.create(),
			translation,
			scale
		);

		return {
			id: GIZMO_AXIS_IDS[axis],
			transform,
			material: handleMaterials[axis],
			vertexBuffer: handleMesh.vertexBuffer,
			indexBuffer: handleMesh.indexBuffer,
		};
	});
}
