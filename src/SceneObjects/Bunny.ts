import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { SceneObject } from "../Renderer/SceneObject";

import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import { parseOBJ } from "../Geometry/OBJLoader";
import bunnyObj from "../../res/models/bunny.obj";

/**
 * The Stanford Bunny - one of the two most recognizable test models in computer
 * graphics. The geometry is loaded from an OBJ file (see res/models) via
 * OBJLoader, which computes smooth normals and centers/scales the model to a
 * unit box so it frames correctly under the default camera.
 */

const bunnyMesh = parseOBJ(bunnyObj);

const vertexShader = new Shader(VertLightingShader, ShaderType.VERTEX);
const fragmentShader = new Shader(FragLightingShader, ShaderType.FRAGMENT);
const shaderProgram = new ShaderProgram(vertexShader, fragmentShader);

const material = new Material("Bunny Material", shaderProgram, [
	{
		type: MaterialPropertyType.VEC4,
		name: "u_color",
		value: [0.82, 0.71, 0.55, 1], // warm cream/tan
	},
]);

/**
 * Builds the bunny test scene: a single centered Stanford Bunny.
 *
 * @returns - The scene's objects, ready to hand to Scene.objectList.
 */
function createBunnyScene(): SceneObject[] {
	const bunny = new SceneObject(bunnyMesh, material);
	bunny.name = "Stanford Bunny";
	return [bunny];
}

export { createBunnyScene };
