import { vec3, vec4 } from "gl-matrix";
import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { Mesh } from "../Geometry/Mesh";
import { Sphere } from "../Geometry/Sphere";
import { Box } from "../Geometry/Box";
import { parseOBJ } from "../Geometry/OBJLoader";
import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import bunnyObj from "../../res/models/bunny.obj";
import dragonObj from "../../res/models/dragon.obj";

import { World, Entity } from "./World";
import { Transform, TransformData, createTransform } from "./components/Transform";
import { MeshRef } from "./components/MeshRef";
import { MaterialRef } from "./components/MaterialRef";
import { Named } from "./components/Named";

/**
 * Building blocks for populating the world: shared GPU resources plus helpers
 * that spawn entities with the standard renderable components. Meshes and the
 * shader program are module singletons so they are built/compiled once and
 * shared by every entity that uses them (e.g. all snowman balls share one
 * sphere mesh).
 */

// One shared lit shader program for every entity (compiled once on the GPU).
export const litProgram = new ShaderProgram(
	new Shader(VertLightingShader, ShaderType.VERTEX),
	new Shader(FragLightingShader, ShaderType.FRAGMENT)
);

/** A material that uses the shared lit program with its own color. */
export function litMaterial(name: string, color: vec4): Material {
	return new Material(name, litProgram, [
		{ type: MaterialPropertyType.VEC4, name: "u_color", value: color },
	]);
}

// Shared geometry, built once and referenced by many entities.
export const sphereMesh: Mesh = new Sphere(1).calculateMesh(32);
export const boxMesh: Mesh = new Box(vec3.fromValues(2, 2, 2)).calculateMesh();
export const bunnyMesh: Mesh = parseOBJ(bunnyObj);
export const dragonMesh: Mesh = parseOBJ(dragonObj);

/** The components every drawable entity needs. */
export interface RenderableSpec {
	mesh: Mesh;
	material: Material;
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
