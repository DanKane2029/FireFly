import { vec3 } from "gl-matrix";
import { defineComponent } from "../Component";
import { Vec3JSON, vec3FromJSON, vec3ToJSON } from "../../Math/VectorCodec";

/**
 * Makes an entity rotate over time. `degreesPerSecond` is the angular velocity
 * around each axis (X, Y, Z); the AnimationSystem adds it to the entity's
 * Transform rotation every frame. Pure data - the behavior lives in the system.
 */
export interface SpinData {
	degreesPerSecond: vec3;
}

export const Spin = defineComponent<SpinData>("Spin");

/** A Spin's JSON shape in a `.ffscene` file. */
export interface SpinJSON {
	degreesPerSecond: Vec3JSON;
}

/** Encodes a SpinData for `.ffscene` (a vec3 does not survive JSON.stringify
 * as-is - see Math/VectorCodec). */
export function spinToJSON(data: SpinData): SpinJSON {
	return { degreesPerSecond: vec3ToJSON(data.degreesPerSecond) };
}

/** Decodes a Spin from its `.ffscene` JSON shape. */
export function spinFromJSON(json: SpinJSON): SpinData {
	return { degreesPerSecond: vec3FromJSON(json.degreesPerSecond) };
}
