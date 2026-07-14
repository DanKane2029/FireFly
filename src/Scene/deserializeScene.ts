import { World } from "../ecs/World";
import { AssetRegistry } from "../Assets/AssetRegistry";
import { Camera } from "../Renderer/Camera";
import { ShaderProgram } from "../Renderer/Shader";
import {
	MaterialProperty,
	materialPropertyTypeFromString,
} from "../Renderer/Material";
import { COMPONENT_CODECS_BY_NAME } from "./ComponentCodecs";
import { MaterialPropertyJSON, SCENE_FORMAT, SCENE_VERSION, SceneFile } from "./SceneFile";
import { quatFromJSON, vec3FromJSON, vec4FromJSON } from "../Math/VectorCodec";
import { EnvironmentData } from "./serializeScene";

/**
 * Populates `world` and `registry` from a `.ffscene` document and applies its
 * camera. Returns the environment (ambient light, background color) for the
 * caller to apply - those are private `App` fields this function has no
 * access to.
 *
 * Assumes `world` has already been cleared of whatever it held before (see
 * App.loadScene's existing dispose-then-clear pattern for materials); this
 * function does not itself clear or dispose anything.
 *
 * @param file - The scene to load
 * @param world - The (already-cleared) world to populate
 * @param registry - The asset registry to populate. Built-in/primitive mesh
 * assets must already be registered (they are process-wide singletons - see
 * prefabs.ts); material assets are (re)created here under the file's ids, via
 * `AssetRegistry.restoreMaterial`.
 * @param camera - The camera to apply the file's camera data to
 * @param shaderPrograms - Live ShaderProgram objects keyed by the shader id a
 * material asset references (e.g. "lit"). The scene format only knows shaders
 * by id; resolving that id to an actual compiled program is the caller's job,
 * so this module never has to import prefabs.ts.
 */
export function deserializeScene(
	file: SceneFile,
	world: World,
	registry: AssetRegistry,
	camera: Camera,
	shaderPrograms: Record<string, ShaderProgram>
): EnvironmentData {
	if (file.format !== SCENE_FORMAT) {
		throw new Error(`Not a Firefly scene file (format "${file.format}").`);
	}
	if (file.version !== SCENE_VERSION) {
		throw new Error(`Unsupported scene file version ${file.version}.`);
	}

	file.assets.forEach((asset) => {
		if (asset.type === "mesh") {
			// Built-in/primitive meshes are process-wide singletons registered
			// once at startup - this just confirms the asset the file expects is
			// actually there, with a clear error if not, rather than silently
			// rendering nothing for it.
			registry.resolveMesh(asset.id);
			return;
		}

		const program = shaderPrograms[asset.shader];
		if (!program) {
			throw new Error(
				`Unknown shader "${asset.shader}" for material "${asset.name}".`
			);
		}
		registry.restoreMaterial(
			asset.id,
			asset.name,
			program,
			asset.properties.map(materialPropertyFromJSON)
		);
	});

	file.entities.forEach((entry) => {
		world.createWith(entry.id);
		Object.entries(entry.components).forEach(([name, json]) => {
			const codec = COMPONENT_CODECS_BY_NAME.get(name);
			if (!codec) {
				throw new Error(`Unknown component "${name}" in scene file.`);
			}
			world.add(entry.id, codec.component, codec.fromJSON(json));
		});
	});

	camera.translation = vec3FromJSON(file.camera.translation);
	camera.orientation = quatFromJSON(file.camera.orientation);
	camera.fovy = file.camera.fovy;

	return {
		ambientLight: vec3FromJSON(file.environment.ambientLight),
		backgroundColor: vec4FromJSON(file.environment.backgroundColor),
	};
}

function materialPropertyFromJSON(
	json: MaterialPropertyJSON
): MaterialProperty {
	return {
		name: json.name,
		type: materialPropertyTypeFromString(json.type),
		value: json.value as MaterialProperty["value"],
	};
}
