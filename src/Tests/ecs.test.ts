import { describe, expect, test } from "@jest/globals";
import { vec3 } from "gl-matrix";
import { World } from "../ecs/World";
import { defineComponent } from "../ecs/Component";
import { Transform, createTransform } from "../ecs/components/Transform";
import { Spin } from "../ecs/components/Spin";
import { PointLight } from "../ecs/components/PointLight";
import { animationSystem } from "../ecs/systems/AnimationSystem";
import { renderSystem } from "../ecs/systems/RenderSystem";
import { Renderer } from "../Renderer/Renderer";
import { Camera } from "../Renderer/Camera";

interface Position {
	x: number;
	y: number;
}
interface Velocity {
	dx: number;
	dy: number;
}

const Position = defineComponent<Position>("Position");
const Velocity = defineComponent<Velocity>("Velocity");
const Tag = defineComponent<true>("Tag");

describe("World entities and components", () => {
	test("creates distinct entity ids", () => {
		const world = new World();
		const a = world.create();
		const b = world.create();
		expect(a).not.toBe(b);
		expect(world.size).toBe(2);
	});

	test("adds, reads, and checks components", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Position, { x: 1, y: 2 });

		expect(world.has(e, Position)).toBe(true);
		expect(world.has(e, Velocity)).toBe(false);
		expect(world.get(e, Position)).toEqual({ x: 1, y: 2 });
		expect(world.get(e, Velocity)).toBeUndefined();
	});

	test("removing a component leaves the entity alive", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Tag, true);
		world.remove(e, Tag);
		expect(world.has(e, Tag)).toBe(false);
		expect(world.isAlive(e)).toBe(true);
	});

	test("destroying an entity drops all its components", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Position, { x: 0, y: 0 });
		world.destroy(e);
		expect(world.isAlive(e)).toBe(false);
		expect(world.has(e, Position)).toBe(false);
		expect(world.size).toBe(0);
	});

	test("entities() lists every alive entity", () => {
		const world = new World();
		const a = world.create();
		const b = world.create();
		expect(world.entities().sort()).toEqual([a, b].sort());
	});

	test("createWith preserves a caller-chosen id, for deserialization", () => {
		const world = new World();
		world.create(); // id 1
		const restored = world.createWith(42);
		expect(restored).toBe(42);
		expect(world.isAlive(42)).toBe(true);
	});

	test("createWith bumps the id counter so a later create() never collides", () => {
		const world = new World();
		world.createWith(42);
		const next = world.create();
		expect(next).toBeGreaterThan(42);
	});
});

describe("World queries", () => {
	test("returns only entities that have all requested components", () => {
		const world = new World();

		const both = world.create();
		world.add(both, Position, { x: 1, y: 1 });
		world.add(both, Velocity, { dx: 1, dy: 0 });

		const posOnly = world.create();
		world.add(posOnly, Position, { x: 2, y: 2 });

		const single = world.query(Position);
		expect(single.map(([e]) => e).sort()).toEqual([both, posOnly].sort());

		const pair = world.query(Position, Velocity);
		expect(pair.length).toBe(1);
		const [entity, position, velocity] = pair[0];
		expect(entity).toBe(both);
		expect(position.x).toBe(1);
		expect(velocity.dx).toBe(1);
	});

	test("clear() empties the world", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Position, { x: 0, y: 0 });
		world.clear();
		expect(world.size).toBe(0);
		expect(world.query(Position).length).toBe(0);
	});
});

describe("AnimationSystem", () => {
	test("advances rotation by degreesPerSecond * dt", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Transform, createTransform());
		world.add(e, Spin, { degreesPerSecond: [0, 90, 0] });

		animationSystem(world, 0.5, 0.5); // half a second

		const transform = world.get(e, Transform);
		expect(transform?.rotation[1]).toBeCloseTo(45, 5);
	});

	test("leaves entities without a Spin untouched", () => {
		const world = new World();
		const e = world.create();
		world.add(e, Transform, createTransform());

		animationSystem(world, 1, 1);

		expect(world.get(e, Transform)?.rotation[1]).toBe(0);
	});
});

describe("RenderSystem lighting", () => {
	/**
	 * The RenderSystem only ever calls `render` on the Renderer, so a stub that
	 * records the arguments is enough to test what the system gathers - no GL
	 * context needed.
	 */
	function stubRenderer() {
		const calls: { renderables: unknown[]; lightPositions: vec3[] }[] = [];
		const renderer = {
			render: (
				renderables: unknown[],
				_camera: Camera,
				_ambient: vec3,
				lightPositions: vec3[]
			) => calls.push({ renderables, lightPositions }),
		} as unknown as Renderer;
		return { renderer, calls };
	}

	const context = (renderer: Renderer) => ({
		renderer,
		camera: new Camera(1, 45, 0.01, 1000),
		ambientLight: vec3.fromValues(0.1, 0.1, 0.1),
	});

	test("gathers a light's position from its Transform", () => {
		const world = new World();
		const light = world.create();
		world.add(light, Transform, createTransform({ translation: [5, 0, 10] }));
		world.add(light, PointLight, {});

		const { renderer, calls } = stubRenderer();
		renderSystem(world, context(renderer));

		// Compare contents, not container: a Transform holds whatever vec3-ish
		// array it was given (a plain array here), which the GL uniform setter
		// accepts just the same as a Float32Array.
		expect(calls[0].lightPositions).toHaveLength(1);
		expect(Array.from(calls[0].lightPositions[0])).toEqual([5, 0, 10]);
	});

	test("a light with no mesh lights the scene without being drawn", () => {
		const world = new World();
		const light = world.create();
		world.add(light, Transform, createTransform({ translation: [1, 2, 3] }));
		world.add(light, PointLight, {});

		const { renderer, calls } = stubRenderer();
		renderSystem(world, context(renderer));

		expect(calls[0].lightPositions).toHaveLength(1);
		expect(calls[0].renderables).toHaveLength(0);
	});

	test("entities without the PointLight tag are not lights", () => {
		const world = new World();
		const notALight = world.create();
		world.add(notALight, Transform, createTransform({ translation: [9, 9, 9] }));

		const { renderer, calls } = stubRenderer();
		renderSystem(world, context(renderer));

		expect(calls[0].lightPositions).toHaveLength(0);
	});

	test("destroying a light entity turns the light off", () => {
		const world = new World();
		const light = world.create();
		world.add(light, Transform, createTransform({ translation: [5, 0, 10] }));
		world.add(light, PointLight, {});

		const { renderer, calls } = stubRenderer();
		renderSystem(world, context(renderer));
		expect(calls[0].lightPositions).toHaveLength(1);

		world.destroy(light);
		renderSystem(world, context(renderer));
		expect(calls[1].lightPositions).toHaveLength(0);
	});
});
