import { Shader, ShaderProgram, ShaderType } from "../Renderer/Shader";
import { Material, MaterialPropertyType } from "../Renderer/Material";
import { SceneObject } from "../Renderer/SceneObject";

import VertLightingShader from "../Shaders/Lighting.vert.glsl";
import FragLightingShader from "../Shaders/Lighting.frag.glsl";
import { parseOBJ } from "../Geometry/OBJLoader";
import dragonObj from "../../res/models/dragon.obj";

/**
 * The Stanford Dragon - the other iconic graphics test model, here as a
 * decimated (~48k-triangle) version of the original scan. Loaded from OBJ via
 * OBJLoader (smooth normals computed, centered and scaled to a unit box).
 */

const dragonMesh = parseOBJ(dragonObj);

const vertexShader = new Shader(VertLightingShader, ShaderType.VERTEX);
const fragmentShader = new Shader(FragLightingShader, ShaderType.FRAGMENT);
const shaderProgram = new ShaderProgram(vertexShader, fragmentShader);

const material = new Material("Dragon Material", shaderProgram, [
	{
		type: MaterialPropertyType.VEC4,
		name: "u_color",
		value: [0.3, 0.7, 0.5, 1], // jade green
	},
]);

/**
 * Builds the dragon test scene: a single centered Stanford Dragon.
 *
 * @returns - The scene's objects, ready to hand to Scene.objectList.
 */
function createDragonScene(): SceneObject[] {
	const dragon = new SceneObject(dragonMesh, material);
	dragon.name = "Stanford Dragon";
	return [dragon];
}

export { createDragonScene };
