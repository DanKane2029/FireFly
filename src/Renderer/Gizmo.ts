import { mat4, quat, vec3 } from "gl-matrix";
import { MaterialPropertyType } from "./Material";
import { Box } from "../Geometry/Box";
import { Ring } from "../Geometry/Ring";
import { litProgram } from "../ecs/prefabs";
import { assetRegistry } from "../Assets/AssetRegistry";
import { AssetId } from "../Assets/AssetId";
import {
	AXIS_VECTORS,
	GizmoAxis,
	GizmoMode,
	axisIndex,
	worldSizeForDistance,
} from "./GizmoAxis";

/**
 * Builds the specs for the gizmo's draggable handles - entities the caller
 * (App.render()) spawns/updates in the ECS world, for whichever of the three
 * drag modes (GizmoMode) is active: translate (three bars), rotate (three
 * rings), or scale (three bars with a knob at the tip).
 *
 * Handles are real entities now (Transform + MeshRef + MaterialRef, tagged
 * EditorOnly + Transient + GizmoHandle{axis} - see App.render()), not the
 * ad-hoc overlay Renderables an earlier version of this file built fresh
 * every frame outside the ECS. That's what lets them draw depth-tested
 * through the normal render pass (occludable by real geometry) instead of a
 * special always-on-top pass, and what lets GizmoController resolve a
 * Picker hit back to an axis via a component lookup instead of a reserved-id
 * scheme.
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
// handle (translate's bars, scale's bars and tip knobs) - each entity is
// just this box's Transform scaled and positioned per handle. Registered
// once under a stable id, matching prefabs.ts's pattern for the built-in
// geometry, so gizmo entities can reference it via MeshRef like any other
// entity does.
const gizmoBarMesh: AssetId = assetRegistry.registerMesh(
	"mesh/gizmo-bar",
	{ kind: "builtin", name: "gizmo-bar" },
	new Box(vec3.fromValues(1, 1, 1)).calculateMesh()
);

// A unit-ish ring (outer radius 1), shared by all three rotation rings -
// each entity is just this scaled uniformly to the gizmo's live on-screen
// size and oriented to face the axis it rotates around (see
// buildRotateHandles).
const gizmoRingMesh: AssetId = assetRegistry.registerMesh(
	"mesh/gizmo-ring",
	{ kind: "builtin", name: "gizmo-ring" },
	new Ring(1 - RING_THICKNESS_FRACTION, 1).calculateMesh(RING_DETAIL)
);

const gizmoMaterialIds: Record<GizmoAxis, AssetId> = {
	x: assetRegistry.registerMaterial("mat/gizmo-x", "Gizmo X", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.9, 0.2, 0.2, 1],
		},
	]),
	y: assetRegistry.registerMaterial("mat/gizmo-y", "Gizmo Y", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.2, 0.9, 0.2, 1],
		},
	]),
	z: assetRegistry.registerMaterial("mat/gizmo-z", "Gizmo Z", litProgram, [
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.2, 0.4, 0.9, 1],
		},
	]),
};

/** One gizmo handle entity's worth of spec: which axis it drags, which
 * shared mesh it uses, and its computed world transform this frame. App
 * turns this into (or updates) an actual ECS entity - see App.render(). */
export interface GizmoHandleSpec {
	axis: GizmoAxis;
	mesh: AssetId;
	material: AssetId;
	transform: mat4;
}

/**
 * Builds the handle specs for a gizmo centered at `position`, sized relative
 * to `cameraPosition`'s distance from it, for whichever mode is currently
 * active.
 */
export function buildGizmoHandleSpecs(
	mode: GizmoMode,
	position: vec3,
	cameraPosition: vec3
): GizmoHandleSpec[] {
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
): GizmoHandleSpec[] {
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
			axis,
			mesh: gizmoBarMesh,
			material: gizmoMaterialIds[axis],
			transform,
		};
	});
}

/** Three rings, centered on `position`, each lying in the plane
 * perpendicular to the axis it rotates the object around - dragging one
 * measures the angle the cursor has swept around that axis. */
function buildRotateHandles(
	position: vec3,
	cameraPosition: vec3
): GizmoHandleSpec[] {
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
			axis,
			mesh: gizmoRingMesh,
			material: gizmoMaterialIds[axis],
			transform,
		};
	});
}

/** The same three bars translate uses, plus a small cube "knob" at each
 * bar's tip - visually distinct from translate's plain bars - dragging one
 * scales the object along that axis. */
function buildScaleHandles(
	position: vec3,
	cameraPosition: vec3
): GizmoHandleSpec[] {
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
			axis,
			mesh: gizmoBarMesh,
			material: gizmoMaterialIds[axis],
			transform,
		};
	});

	return [...bars, ...knobs];
}
