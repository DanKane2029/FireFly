import { vec3 } from "gl-matrix";
import { defineComponent } from "../Component";

/**
 * Makes an entity rotate over time. `degreesPerSecond` is the angular velocity
 * around each axis (X, Y, Z); the AnimationSystem adds it to the entity's
 * Transform rotation every frame. Pure data - the behavior lives in the system.
 */
export interface SpinData {
	degreesPerSecond: vec3;
}

export const Spin = defineComponent<SpinData>("Spin");
