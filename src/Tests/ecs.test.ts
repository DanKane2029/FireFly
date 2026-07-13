import { describe, expect, test } from "@jest/globals";
import { World } from "../ecs/World";
import { defineComponent } from "../ecs/Component";

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
