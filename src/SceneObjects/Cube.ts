import {
	VertexBuffer,
	IndexBuffer,
	VertexBufferLayout,
	VertexTypes,
} from "../Renderer/Buffer";
import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { SceneObject } from "../Renderer/SceneObject";

/**
 * Creates a cube scene object to be used within the application. This is mainly used for testing.
 */

const vertexBuffer: VertexBuffer = new VertexBuffer(
	new Float32Array([
		1.0, -1.0, -1.0,

		1.0, -1.0, 1.0,

		-1.0, -1.0, 1.0,

		-1.0, -1.0, -1.0,

		1.0, 1.0, -1.0,

		1.0, 1.0, 1.0,

		-1.0, 1.0, 1.0,

		-1.0, 1.0, -1.0,
	]),
	new VertexBufferLayout([
		{
			name: "position",
			size: 3,
			type: VertexTypes.FLOAT,
			normalized: false,
		},
	])
);

const indexBuffer: IndexBuffer = new IndexBuffer(
	new Uint32Array([
		1, 2, 3,

		7, 6, 5,

		4, 5, 1,

		5, 6, 2,

		2, 6, 7,

		0, 3, 7,

		0, 1, 3,

		4, 7, 5,

		0, 4, 1,

		1, 5, 2,

		3, 2, 7,

		4, 0, 7,
	])
);

const vertexShader: Shader = new Shader(
	`
	precision mediump float;

	attribute vec3 position;
	attribute vec2 texCoord;

	uniform mat4 transform;
	uniform mat4 perspective;
	uniform mat4 view;

	uniform vec4 color;

	varying vec4 v_color;
	varying vec4 v_position;
	varying vec2 v_texCoord;

	void main(void) {
		v_color = color;
		v_texCoord = texCoord;
		v_position = perspective * view * transform * vec4(position, 1.0);
		gl_Position = v_position;
	}
	`,
	ShaderType.VERTEX
);

const fragmentShader: Shader = new Shader(
	`
	precision mediump float;

	varying vec4 v_color;
	varying vec4 v_position;
	varying vec2 v_texCoord;
	uniform vec4 color;

	uniform sampler2D texture;

	void main(void) {
		gl_FragColor = color;
	}
	`,
	ShaderType.FRAGMENT
);

const shaderProgram: ShaderProgram = new ShaderProgram(
	vertexShader,
	fragmentShader
);

const material: Material = new Material("Cube Material", shaderProgram, [
	{
		type: MaterialPropertyType.VEC4,
		name: "color",
		value: [0.86, 0.34, 0.56, 1],
	},
]);

const cube: SceneObject = new SceneObject(vertexBuffer, indexBuffer, material);
cube.name = "Cube";

export { cube };
