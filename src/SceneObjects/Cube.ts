import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { SceneObject } from "../Renderer/SceneObject";

import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import { Box } from "../Geometry/Box";
import { vec3 } from "gl-matrix";
import { Mesh } from "../Geometry/Mesh";

/**
 * Creates a cube scene object to be used within the application. This is mainly used for testing.
 */

const boxGeometry: Box = new Box(vec3.fromValues(2, 2, 2));

const boxMesh: Mesh = boxGeometry.calculateMesh();

const vertexShader: Shader = new Shader(VertLightingShader, ShaderType.VERTEX);

const fragmentShader: Shader = new Shader(
	FragLightingShader,
	ShaderType.FRAGMENT
);

const shaderProgram: ShaderProgram = new ShaderProgram(
	vertexShader,
	fragmentShader
);

const material: Material = new Material("Cube Material", shaderProgram, [
	{
		type: MaterialPropertyType.VEC4,
		name: "u_color",
		value: [0.86, 0.34, 0.56, 1],
	},
]);

const cube: SceneObject = new SceneObject(boxMesh, material);
cube.name = "Cube";

export { cube };
