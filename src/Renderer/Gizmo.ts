import { mat4, quat, vec3 } from "gl-matrix";
import { Renderable } from "./Renderer";
import { Material, MaterialPropertyType } from "./Material";
import { Box } from "../Geometry/Box";
import { Ring } from "../Geometry/Ring";
import { litProgram } from "../ecs/prefabs";
import {
	AXIS_VECTORS,
	GIZMO_AXIS_IDS,
	GizmoAxis,
	GizmoMode,
	axisIndex,
	worldSizeForDistance,
} from "./GizmoAxis";

/**
 * Builds the draggable handles drawn over the selected object, for whichever
 * of the three drag modes (GizmoMode) is active: translate (three bars),
 * rotate (three rings), or scale (three bars with a knob at the tip).
 * Reuses GPU picking (see Picker.ts) rather than any CPU-side hit testing -
 * each handle is drawn into the id-texture like any other Renderable, just
 * with a small reserved id (GizmoAxis.ts) instead of an entity id, and
 * through an overlay pass (see Renderer.render) so it's always visible on
 * top of the scene it's manipulating. Only one mode's handles are ever
 * built for a given frame, so all three modes reuse the same axis ids
 * (GIZMO_AXIS_IDS) with no collision.
 *
 * Pulls in prefabs.ts for the shared lit shader program, which makes this
 * file - like Renderer.ts itself - untestable under Jest (no GL context, and
 * prefabs.ts's webpack-only .glsl imports Jest can't transform either). The
 * id/axis/sizing math this depends on is factored out into GizmoAxis.ts
 * specifically so *that* half stays unit-testable.
 */

const HANDLE_THICKNESS_FRACTION = 0.06; // relative to the handle's own length
const RING_THICKNESS_FRACTION = 0.15; // relative to the ring's own outer radius
const RING_DETAIL = 48; // radial segments - high enough to read as round
const SCALE_KNOB_SIZE_FRACTION = 0.25; // relative to the bar's own length

// A unit cube (spans [-0.5, 0.5] on every axis), shared by every bar/knob
// handle (translate's bars, scale's bars and tip knobs) - each is just this
// box scaled and positioned per handle. One shared Mesh, matching the
// module-singleton pattern prefabs.ts already uses for the built-in geometry.
const handleMesh = new Box(vec3.fromValues(1, 1, 1)).calculateMesh();

// A unit-ish ring (outer radius 1), shared by all three rotation rings -
// each is just this scaled uniformly to the gizmo's live on-screen size and
// oriented to face the axis it rotates around (see buildRotateHandles).
const ringMesh = new Ring(1 - RING_THICKNESS_FRACTION, 1).calculateMesh(
	RING_DETAIL
);

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
 * `position`, sized relative to `cameraPosition`'s distance from it, for
 * whichever mode is currently active.
 */
export function buildGizmoRenderables(
	mode: GizmoMode,
	position: vec3,
	cameraPosition: vec3
): Renderable[] {
	if (mode === "rotate") {
		return buildRotateHandles(position, cameraPosition);
	}
	if (mode === "scale") {
		return buildScaleHandles(position, cameraPosition);
	}
	return buildTranslateHandles(position, cameraPosition);
}

/** Three thin bars along X/Y/Z, each starting at `position` and extending
 * outward - dragging one moves the object along that axis. */
function buildTranslateHandles(
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

/** Three rings, centered on `position`, each lying in the plane
 * perpendicular to the axis it rotates the object around - dragging one
 * measures the angle the cursor has swept around that axis. */
function buildRotateHandles(
	position: vec3,
	cameraPosition: vec3
): Renderable[] {
	const radius = worldSizeForDistance(
		vec3.distance(position, cameraPosition)
	);

	return (Object.keys(AXIS_VECTORS) as GizmoAxis[]).map((axis) => {
		const axisVec = AXIS_VECTORS[axis];

		// The ring mesh's own "flat" direction is local +Z; orient it so
		// that instead points along the world axis it represents.
		const orientation = quat.rotationTo(
			quat.create(),
			vec3.fromValues(0, 0, 1),
			axisVec
		);
		const transform = mat4.fromRotationTranslationScale(
			mat4.create(),
			orientation,
			position,
			vec3.fromValues(radius, radius, radius)
		);

		return {
			id: GIZMO_AXIS_IDS[axis],
			transform,
			material: handleMaterials[axis],
			vertexBuffer: ringMesh.vertexBuffer,
			indexBuffer: ringMesh.indexBuffer,
		};
	});
}

/** The same three bars translate uses, plus a small cube "knob" at each
 * bar's tip - visually distinct from translate's plain bars - dragging one
 * scales the object along that axis. */
function buildScaleHandles(position: vec3, cameraPosition: vec3): Renderable[] {
	const bars = buildTranslateHandles(position, cameraPosition);

	const length = worldSizeForDistance(
		vec3.distance(position, cameraPosition)
	);
	const knobSize = length * SCALE_KNOB_SIZE_FRACTION;

	const knobs = (Object.keys(AXIS_VECTORS) as GizmoAxis[]).map((axis) => {
		const axisVec = AXIS_VECTORS[axis];
		const tip = vec3.scaleAndAdd(vec3.create(), position, axisVec, length);
		const transform = mat4.fromRotationTranslationScale(
			mat4.create(),
			quat.create(),
			tip,
			vec3.fromValues(knobSize, knobSize, knobSize)
		);

		return {
			id: GIZMO_AXIS_IDS[axis],
			transform,
			material: handleMaterials[axis],
			vertexBuffer: handleMesh.vertexBuffer,
			indexBuffer: handleMesh.indexBuffer,
		};
	});

	return [...bars, ...knobs];
}
