import { mat4, quat, vec3 } from "gl-matrix";
import { defineComponent } from "../Component";
import { Vec3JSON, vec3FromJSON, vec3ToJSON } from "../../Math/VectorCodec";

/**
 * Where an entity sits in the world: its position, orientation (Euler angles in
 * degrees), and scale. Pure data - the model matrix is derived on demand by
 * `transformMatrix`, not stored here.
 */
export interface TransformData {
	translation: vec3;
	rotation: vec3; // Euler angles, degrees
	scale: vec3;
}

export const Transform = defineComponent<TransformData>("Transform");

/**
 * Builds a TransformData, defaulting any field left out (origin, no rotation,
 * unit scale).
 */
export function createTransform(
	partial: Partial<TransformData> = {}
): TransformData {
	return {
		translation: partial.translation ?? vec3.fromValues(0, 0, 0),
		rotation: partial.rotation ?? vec3.fromValues(0, 0, 0),
		scale: partial.scale ?? vec3.fromValues(1, 1, 1),
	};
}

/**
 * Composes a transform's translation, rotation, and scale into a model matrix,
 * written into `out` (returned for convenience).
 */
export function transformMatrix(transform: TransformData, out: mat4): mat4 {
	const rotation = quat.fromEuler(
		quat.create(),
		transform.rotation[0],
		transform.rotation[1],
		transform.rotation[2]
	);
	return mat4.fromRotationTranslationScale(
		out,
		rotation,
		transform.translation,
		transform.scale
	);
}

/** A Transform's JSON shape in a `.ffscene` file. */
export interface TransformJSON {
	translation: Vec3JSON;
	rotation: Vec3JSON;
	scale: Vec3JSON;
}

/** Encodes a TransformData for `.ffscene` (see Math/VectorCodec for why this
 * can't just be `JSON.stringify(data)`). */
export function transformToJSON(data: TransformData): TransformJSON {
	return {
		translation: vec3ToJSON(data.translation),
		rotation: vec3ToJSON(data.rotation),
		scale: vec3ToJSON(data.scale),
	};
}

/** Decodes a Transform from its `.ffscene` JSON shape. */
export function transformFromJSON(json: TransformJSON): TransformData {
	return {
		translation: vec3FromJSON(json.translation),
		rotation: vec3FromJSON(json.rotation),
		scale: vec3FromJSON(json.scale),
	};
}
