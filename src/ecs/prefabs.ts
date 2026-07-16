import { vec3, vec4 } from "gl-matrix";
import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { MaterialPropertyType } from "../Renderer/Material";
import { Sphere } from "../Geometry/Sphere";
import { Box } from "../Geometry/Box";
import { Frustum } from "../Geometry/Frustum";
import { parseOBJ } from "../Geometry/OBJLoader";
import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import VertUnlitShader from "../Shaders/Unlit.vert.glsl";
import FragUnlitShader from "../Shaders/Unlit.frag.glsl";
import bunnyObj from "../../res/models/bunny.obj";
import dragonObj from "../../res/models/dragon.obj";

import { World, Entity } from "./World";
import {
	Transform,
	TransformData,
	createTransform,
} from "./components/Transform";
import { MeshRef } from "./components/MeshRef";
import { MaterialRef } from "./components/MaterialRef";
import { Named } from "./components/Named";
import { CameraComponent } from "./components/Camera";
import { EditorOnly } from "./components/EditorOnly";
import { AssetId } from "../Assets/AssetId";
import { assetRegistry } from "../Assets/AssetRegistry";

/**
 * Building blocks for populating the world: shared GPU resources plus helpers
 * that spawn entities with the standard renderable components. Meshes and the
 * shader program are module singletons, registered once with the
 * AssetRegistry, so they are built/compiled once and shared by every entity
 * that uses them (e.g. all snowman balls share one sphere mesh).
 */

// One shared lit shader program for every entity (compiled once on the GPU).
export const litProgram = new ShaderProgram(
	new Shader(VertLightingShader, ShaderType.VERTEX),
	new Shader(FragLightingShader, ShaderType.FRAGMENT)
);

// A flat, lighting-independent shader for overlay geometry that shouldn't be
// shaded like a scene object - the selection outline (Renderer/Outline.ts)
// and the transform gizmo handles both want a solid color regardless of the
// scene's lights, not a Lambert-shaded one.
export const unlitProgram = new ShaderProgram(
	new Shader(VertUnlitShader, ShaderType.VERTEX),
	new Shader(FragUnlitShader, ShaderType.FRAGMENT)
);

/** Registers a material that uses the shared lit program with its own color,
 * returning its asset id. */
export function litMaterial(name: string, color: vec4): AssetId {
	return assetRegistry.createMaterial(name, litProgram, [
		{ type: MaterialPropertyType.VEC4, name: "u_color", value: color },
	]);
}

// Shared geometry, registered once under a stable id and referenced by many
// entities.
export const sphereMesh: AssetId = assetRegistry.registerMesh(
	"mesh/sphere",
	{ kind: "primitive", primitive: "sphere" },
	new Sphere(1).calculateMesh(32)
);
export const boxMesh: AssetId = assetRegistry.registerMesh(
	"mesh/box",
	{ kind: "primitive", primitive: "box" },
	new Box(vec3.fromValues(2, 2, 2)).calculateMesh()
);
export const bunnyMesh: AssetId = assetRegistry.registerMesh(
	"mesh/bunny",
	{ kind: "builtin", name: "bunny" },
	parseOBJ(bunnyObj)
);
export const dragonMesh: AssetId = assetRegistry.registerMesh(
	"mesh/dragon",
	{ kind: "builtin", name: "dragon" },
	parseOBJ(dragonObj)
);

// A camera entity's viewport icon: a small pyramid pointing down -Z (this
// engine's forward convention), unlit (a flat, always-legible marker color
// regardless of scene lighting - see prefabs.ts's unlitProgram). One shared
// mesh/material, matching every other built-in asset's registered-once
// pattern - see spawnCamera.
export const cameraIconMesh: AssetId = assetRegistry.registerMesh(
	"mesh/camera-icon",
	{ kind: "builtin", name: "camera-icon" },
	new Frustum(vec3.fromValues(0.12, 0.08, 0.2)).calculateMesh()
);
export const cameraIconMaterial: AssetId = assetRegistry.registerMaterial(
	"mat/camera-icon",
	"Camera Icon",
	unlitProgram,
	[
		{
			type: MaterialPropertyType.VEC4,
			name: "u_color",
			value: [0.9, 0.9, 0.9, 1],
		},
	]
);

/** The components every drawable entity needs. */
export interface RenderableSpec {
	mesh: AssetId;
	material: AssetId;
	name?: string;
	transform: TransformData;
}

/** Spawns an entity with Transform + MeshRef + MaterialRef (+ optional Named). */
export function spawnRenderable(world: World, spec: RenderableSpec): Entity {
	const entity = world.create();
	world.add(entity, Transform, spec.transform);
	world.add(entity, MeshRef, { mesh: spec.mesh });
	world.add(entity, MaterialRef, { material: spec.material });
	if (spec.name !== undefined) {
		world.add(entity, Named, { name: spec.name });
	}
	return entity;
}

/** Spawns a cube (used by the Add Cube controller). */
export function spawnCube(
	world: World,
	options: { translation?: vec3; scale?: vec3 } = {}
): Entity {
	return spawnRenderable(world, {
		mesh: boxMesh,
		material: litMaterial("Cube Material", [0.86, 0.34, 0.56, 1]),
		name: "Cube",
		transform: createTransform({
			translation: options.translation,
			scale: options.scale,
		}),
	});
}

// Sensible defaults for a freshly spawned camera - close to the interactive
// orbit camera's own starting fovy/near/far (App's buildWorld()), so a new
// camera entity's Render panel output looks reasonable immediately.
const DEFAULT_CAMERA_FOV = 45;
const DEFAULT_CAMERA_NEAR = 0.1;
const DEFAULT_CAMERA_FAR = 1000;

/**
 * Spawns a camera entity: a real, persisted scene object (Transform +
 * CameraComponent + Named, so it saves and lists normally - see
 * ComponentCodecs.ts and ObjectManagerPanel), shown in the viewport via its
 * icon mesh (EditorOnly - excluded from a final render, since a camera's own
 * marker obviously shouldn't appear in any render, including one taken
 * through a *different* camera in the same scene).
 */
export function spawnCamera(
	world: World,
	options: { translation?: vec3; rotation?: vec3 } = {}
): Entity {
	const entity = spawnRenderable(world, {
		mesh: cameraIconMesh,
		material: cameraIconMaterial,
		name: "Camera",
		transform: createTransform({
			translation: options.translation,
			rotation: options.rotation,
		}),
	});
	world.add(entity, CameraComponent, {
		fov: DEFAULT_CAMERA_FOV,
		near: DEFAULT_CAMERA_NEAR,
		far: DEFAULT_CAMERA_FAR,
	});
	world.add(entity, EditorOnly, {});
	return entity;
}
