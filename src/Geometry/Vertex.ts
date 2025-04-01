import { vec2, vec3, vec4 } from "gl-matrix";

/**
 * A data object that holds all the possible data that can be in a vertex in a mesh
 */
interface Vertex {
	position: vec3;
	normal?: vec3;
	textureCoord?: vec2;
	color?: vec4;
}

export { Vertex };
