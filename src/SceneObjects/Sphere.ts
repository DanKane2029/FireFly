import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { SceneObject } from "../Renderer/SceneObject";

import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import { Mesh } from "../Geometry/Mesh";
import { Sphere } from "../Geometry/Sphere";

/**
 * Creates a sphere scene object to be used within the application. This is mainly used for testing.
 */

const sphereGeometry = new Sphere(1);
const sphereMesh: Mesh = sphereGeometry.calculateMesh(32);

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
		name: "color",
		value: [0.86, 0.34, 0.56, 1],
	},
]);

const sphere: SceneObject = new SceneObject(sphereMesh, material);
sphere.name = "Sphere";

export { sphere };
