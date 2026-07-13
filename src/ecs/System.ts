import { World } from "./World";

/**
 * A system is just a function that runs each frame over the World. It queries
 * for the entities it cares about and updates their component data.
 *
 * `dt` is the seconds elapsed since the last frame and `time` the total elapsed
 * time, so time-based systems (animation, physics) need no per-entity state.
 *
 * Note: systems that need external resources (the Renderer, the Camera) take
 * them as extra arguments rather than reaching through the World - see
 * RenderSystem. Pure data-only systems (e.g. a future AnimationSystem) match
 * this signature exactly and can be run by the Scheduler.
 */
export type System = (world: World, dt: number, time: number) => void;

/**
 * Runs an ordered list of systems each frame. Order matters (e.g. movement
 * before rendering), so systems run in the order they were added.
 */
export class Scheduler {
	private readonly _systems: System[] = [];

	/** Appends a system to the schedule; returns this for chaining. */
	add(system: System): this {
		this._systems.push(system);
		return this;
	}

	/** Runs every system in order. */
	run(world: World, dt: number, time: number): void {
		for (const system of this._systems) {
			system(world, dt, time);
		}
	}
}
