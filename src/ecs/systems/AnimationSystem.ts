import { System } from "../System";
import { Transform } from "../components/Transform";
import { Spin } from "../components/Spin";

/**
 * Advances every spinning entity's rotation. It queries the world for entities
 * that have both a Transform and a Spin, and adds `degreesPerSecond * dt` to the
 * Transform's rotation each frame.
 *
 * This is the ECS replacement for the old per-object `updateFunction`: instead
 * of behavior living on each object, one system updates all of them, driven by
 * the frame delta so the speed is independent of frame rate.
 */
export const animationSystem: System = (world, dt) => {
	for (const [, transform, spin] of world.query(Transform, Spin)) {
		transform.rotation[0] += spin.degreesPerSecond[0] * dt;
		transform.rotation[1] += spin.degreesPerSecond[1] * dt;
		transform.rotation[2] += spin.degreesPerSecond[2] * dt;
	}
};
