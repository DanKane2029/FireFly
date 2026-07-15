import { mat4 } from "gl-matrix";
import { unlitProgram } from "../ecs/prefabs";
import { Material, MaterialPropertyType } from "./Material";
import { Renderable } from "./Renderer";
import { Mesh } from "../Geometry/Mesh";
import { scaleAboutLocalOrigin } from "./OutlineMath";

// Grows the outlined copy 3% past the real mesh - enough to read clearly as
// a rim at normal zoom without ballooning into a visibly oversized halo.
const OUTLINE_SCALE_FACTOR = 1.03;

// The theme's accent color (fireflyColors.glow, #D9FF4D - see UI/theme.ts),
// as the vec4 a material property needs. Not imported from theme.ts directly:
// that file pulls in MUI's theme types, which have no reason to be a
// dependency of the renderer.
const OUTLINE_COLOR: [number, number, number, number] = [
	0.851, 1.0, 0.302, 1.0,
];

// One shared material for every outline - it never varies per-object, so
// there is nothing to gain from minting a fresh one per selection the way
// AssetRegistry.createMaterial does for scene objects.
const outlineMaterial = new Material("Selection Outline", unlitProgram, [
	{ type: MaterialPropertyType.VEC4, name: "u_color", value: OUTLINE_COLOR },
]);

/**
 * Builds the Renderable for a selection outline: the selected entity's own
 * mesh, scaled up slightly about its own pivot (see scaleAboutLocalOrigin)
 * and drawn with only backfaces visible (Renderer.render toggles cullFace to
 * FRONT for this pass) so only the thin sliver poking past the real mesh - a
 * silhouette rim - actually shows. Depth-tested against the main pass like
 * normal geometry, unlike the gizmo overlay, so it's naturally hidden behind
 * whatever's in front of the selected object.
 *
 * Reuses the entity's own id so this pass stays pickable - clicking the rim
 * should select the same object clicking the object itself would.
 */
export function buildOutlineRenderable(
	entityId: number,
	worldTransform: mat4,
	mesh: Mesh
): Renderable {
	return {
		id: entityId,
		transform: scaleAboutLocalOrigin(worldTransform, OUTLINE_SCALE_FACTOR),
		material: outlineMaterial,
		vertexBuffer: mesh.vertexBuffer,
		indexBuffer: mesh.indexBuffer,
	};
}
