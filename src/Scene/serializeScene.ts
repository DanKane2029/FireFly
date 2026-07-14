import { vec3, vec4 } from "gl-matrix";
import { World } from "../ecs/World";
import { AssetRegistry } from "../Assets/AssetRegistry";
import { AssetId } from "../Assets/AssetId";
import { Camera } from "../Renderer/Camera";
import { MeshRef } from "../ecs/components/MeshRef";
import { MaterialRef } from "../ecs/components/MaterialRef";
import {
	MaterialProperty,
	MaterialPropertyType,
	materialPropertyTypeToString,
} from "../Renderer/Material";
import { COMPONENT_CODECS_BY_NAME } from "./ComponentCodecs";
import {
	AssetJSON,
	EntityJSON,
	MaterialPropertyJSON,
	SCENE_FORMAT,
	SCENE_VERSION,
	SceneFile,
} from "./SceneFile";
import { quatToJSON, vec3ToJSON, vec4ToJSON } from "../Math/VectorCodec";

/** The camera, ambient light, and background color the scene format needs but
 * the ECS doesn't own - they're private `App` fields (see the roadmap). */
export interface EnvironmentData {
	ambientLight: vec3;
	backgroundColor: vec4;
}

/**
 * Builds a `.ffscene` document from a world. Captures exactly the assets its
 * entities reference - not every asset the registry happens to know about -
 * so an unrelated asset sitting in the registry never leaks into an unrelated
 * scene's file.
 *
 * @param world - The world to serialize
 * @param registry - Resolves the world's MeshRef/MaterialRef asset ids to the
 * descriptors written into the file's `assets` list
 * @param camera - The camera to capture
 * @param environment - The ambient light and background color to capture
 */
export function serializeScene(
	world: World,
	registry: AssetRegistry,
	camera: Camera,
	environment: EnvironmentData
): SceneFile {
	const usedMeshIds = new Set<AssetId>();
	const usedMaterialIds = new Set<AssetId>();

	const entities: EntityJSON[] = world.entities().map((entity) => {
		const components: Record<string, unknown> = {};
		COMPONENT_CODECS_BY_NAME.forEach((codec) => {
			const data = world.get(entity, codec.component);
			if (data !== undefined) {
				components[codec.component.name] = codec.toJSON(data);
			}
		});

		const meshRef = world.get(entity, MeshRef);
		if (meshRef) {
			usedMeshIds.add(meshRef.mesh);
		}
		const materialRef = world.get(entity, MaterialRef);
		if (materialRef) {
			usedMaterialIds.add(materialRef.material);
		}

		return { id: entity, components };
	});

	const meshAssets: AssetJSON[] = Array.from(usedMeshIds).map((id) => ({
		id,
		type: "mesh",
		source: registry.meshDescriptor(id),
	}));

	const materialAssets: AssetJSON[] = Array.from(usedMaterialIds).map((id) => {
		const descriptor = registry.materialDescriptor(id);
		return {
			id,
			type: "material",
			shader: descriptor.shader,
			name: descriptor.name,
			properties: descriptor.properties.map(materialPropertyToJSON),
		};
	});

	return {
		format: SCENE_FORMAT,
		version: SCENE_VERSION,
		camera: {
			translation: vec3ToJSON(camera.translation),
			orientation: quatToJSON(camera.orientation),
			fovy: camera.fovy,
		},
		environment: {
			ambientLight: vec3ToJSON(environment.ambientLight),
			backgroundColor: vec4ToJSON(environment.backgroundColor),
		},
		assets: [...meshAssets, ...materialAssets],
		entities,
	};
}

function materialPropertyToJSON(
	property: MaterialProperty
): MaterialPropertyJSON {
	if (property.type === MaterialPropertyType.TEXTURE) {
		// Textures have no id, name, or source path yet (that lands with the
		// roadmap's texturing milestone) - there is nothing serializable to
		// write for one yet.
		throw new Error(
			`Cannot serialize texture property "${property.name}": texture assets aren't supported yet.`
		);
	}
	return {
		name: property.name,
		type: materialPropertyTypeToString(property.type),
		value: Array.from(property.value as ArrayLike<number>),
	};
}
