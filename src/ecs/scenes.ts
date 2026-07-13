import { vec3, vec4 } from "gl-matrix";
import { World } from "./World";
import { Transform, createTransform } from "./components/Transform";
import { Spin } from "./components/Spin";
import { PointLight } from "./components/PointLight";
import {
	sphereMesh,
	bunnyMesh,
	dragonMesh,
	litMaterial,
	spawnRenderable,
} from "./prefabs";

/**
 * Scene "prefabs": functions that populate a World with a set of entities. They
 * replace the old `createSnowman` / `createBunnyScene` / `createDragonScene`
 * object factories - the geometry and materials are the same, but they are now
 * attached to entities as components instead of bundled into SceneObjects.
 */

/**
 * The lighting rig every test scene shares: one point light off to the right and
 * in front. A light is just an entity - a Transform for where it is, and the
 * PointLight tag to say what it is. It has no mesh, so it lights the scene
 * without being drawn.
 */
export function spawnDefaultLights(world: World): void {
	const light = world.create();
	world.add(light, Transform, createTransform({ translation: [5, 0, 10] }));
	world.add(light, PointLight, {});
}

/** A snowman built from spheres. Every ball shares one sphere mesh. */
export function spawnSnowman(world: World): void {
	const ball = (
		name: string,
		translation: vec3,
		scale: vec3,
		color: vec4,
		rotation?: vec3
	) =>
		spawnRenderable(world, {
			mesh: sphereMesh,
			material: litMaterial(`${name} Material`, color),
			name,
			transform: createTransform({ translation, scale, rotation }),
		});

	ball("Bottom", [0, -0.3, 0], [0.2, 0.2, 0.2], [1, 0, 0, 1]);
	ball("Middle", [0, 0, 0], [0.15, 0.15, 0.15], [0, 1, 0, 1]);
	ball("Head", [0, 0.22, 0], [0.1, 0.1, 0.1], [0, 0, 1, 1]);
	ball(
		"Top button",
		[0, 0.1, 0.12],
		[0.015, 0.015, 0.011],
		[0, 0, 0, 1],
		[-40, 0, 0]
	);
	ball(
		"Middle button",
		[0, 0.052, 0.145],
		[0.015, 0.015, 0.015],
		[0, 0, 0, 1]
	);
	ball("Bottom button", [0, 0, 0.15], [0.015, 0.015, 0.015], [0, 0, 0, 1]);
	ball("Right eye", [0.035, 0.25, 0.08], [0.015, 0.015, 0.015], [0, 0, 0, 1]);
	ball("Left eye", [-0.035, 0.25, 0.08], [0.015, 0.015, 0.015], [0, 0, 0, 1]);
	ball("Nose", [0, 0.22, 0.1], [0.01, 0.01, 0.05], [0.8, 0.4, 0, 1]);
}

/** The Stanford bunny, centered, slowly rotating on a turntable. */
export function spawnBunny(world: World): void {
	const bunny = spawnRenderable(world, {
		mesh: bunnyMesh,
		material: litMaterial("Bunny Material", [0.82, 0.71, 0.55, 1]),
		name: "Stanford Bunny",
		transform: createTransform(),
	});
	world.add(bunny, Spin, { degreesPerSecond: [0, 25, 0] });
}

/** The Stanford dragon, centered, slowly rotating on a turntable. */
export function spawnDragon(world: World): void {
	const dragon = spawnRenderable(world, {
		mesh: dragonMesh,
		material: litMaterial("Dragon Material", [0.3, 0.7, 0.5, 1]),
		name: "Stanford Dragon",
		transform: createTransform(),
	});
	world.add(dragon, Spin, { degreesPerSecond: [0, 25, 0] });
}
