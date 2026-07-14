import { quat, vec3, vec4 } from "gl-matrix";

/**
 * gl-matrix vectors are `Float32Array`s, and `JSON.stringify` turns a
 * `Float32Array` into an object (`{"0":1,"1":2,"2":3}`), not an array - so
 * anything holding a vec3/quat needs to go through these before it can be
 * written to or read from a `.ffscene` file.
 */

export type Vec3JSON = [number, number, number];
export type Vec4JSON = [number, number, number, number];
export type QuatJSON = [number, number, number, number];

export function vec3ToJSON(v: vec3): Vec3JSON {
	return [v[0], v[1], v[2]];
}

export function vec3FromJSON(json: Vec3JSON): vec3 {
	return vec3.fromValues(json[0], json[1], json[2]);
}

export function vec4ToJSON(v: vec4): Vec4JSON {
	return [v[0], v[1], v[2], v[3]];
}

export function vec4FromJSON(json: Vec4JSON): vec4 {
	return vec4.fromValues(json[0], json[1], json[2], json[3]);
}

export function quatToJSON(q: quat): QuatJSON {
	return [q[0], q[1], q[2], q[3]];
}

export function quatFromJSON(json: QuatJSON): quat {
	return quat.fromValues(json[0], json[1], json[2], json[3]);
}
