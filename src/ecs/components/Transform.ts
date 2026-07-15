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

/**
 * Decomposes a world matrix into a TransformData - the inverse of
 * transformMatrix. Used by the glTF loader to flatten a node hierarchy
 * (glTF has parent/child nodes; the ECS is flat) into one TRS per mesh-
 * bearing node.
 *
 * Exact only when the matrix's scale is uniform or axis-aligned with the
 * rotation - gl-matrix's mat4.getRotation/getScaling make the same
 * assumption, since a general (skewed, non-uniformly-scaled-and-rotated) 3D
 * transform has no TRS representation at all. Skewed nodes are rare in
 * authored glTF content, and the visual error where they do occur is subtle;
 * don't reach for this to un-skew an arbitrary matrix.
 */
export function transformFromMatrix(matrix: mat4): TransformData {
	const translation = vec3.create();
	mat4.getTranslation(translation, matrix);

	const scale = vec3.create();
	mat4.getScaling(scale, matrix);

	const rotation = quat.create();
	mat4.getRotation(rotation, matrix);
	quat.normalize(rotation, rotation);

	return {
		translation,
		scale,
		rotation: quatToEulerDegrees(rotation),
	};
}

/**
 * Converts a quaternion to Euler degrees in the XYZ order quat.fromEuler
 * (above) expects - the exact inverse away from gimbal lock (pitch at
 * +-90deg), where infinitely many (yaw, roll) pairs represent the same
 * rotation and any single answer returned is necessarily arbitrary.
 * Verified numerically against quat.fromEuler across 2000 random angles
 * (see the roadmap's rotation-conversion landmine).
 */
function quatToEulerDegrees(rotation: quat): vec3 {
	const matrix = mat4.create();
	mat4.fromQuat(matrix, rotation);

	// gl-matrix's mat4 is column-major: matrix[col*4 + row].
	const m00 = matrix[0];
	const m10 = matrix[1];
	const m20 = matrix[2];
	const m11 = matrix[5];
	const m21 = matrix[6];
	const m22 = matrix[10];

	const clamp = (v: number) => Math.max(-1, Math.min(1, v));
	const toDegrees = (radians: number) => (radians * 180) / Math.PI;

	let x: number;
	let z: number;
	const y = Math.asin(clamp(-m20));
	if (Math.abs(m20) < 0.999999) {
		x = Math.atan2(m21, m22);
		z = Math.atan2(m10, m00);
	} else {
		// Gimbal lock: fold the ambiguous yaw/roll split entirely into x, per
		// the doc comment above.
		x = Math.atan2(-matrix[9], m11);
		z = 0;
	}

	return vec3.fromValues(toDegrees(x), toDegrees(y), toDegrees(z));
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
