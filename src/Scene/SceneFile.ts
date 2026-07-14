import { AssetId } from "../Assets/AssetId";
import { MeshDescriptor } from "../Assets/AssetRegistry";
import { QuatJSON, Vec3JSON, Vec4JSON } from "../Math/VectorCodec";

/**
 * The JSON shape of a `.ffscene` file (see docs/scene-creator-roadmap.md).
 * Assets are referenced by id, never embedded: an entity's MeshRef/MaterialRef
 * component holds an AssetId string, and that id is looked up in `assets`.
 */

export const SCENE_FORMAT = "firefly-scene" as const;
export const SCENE_VERSION = 1 as const;

/** A material property's JSON shape - the type is a string name (see
 * materialPropertyTypeToString), never the raw numeric enum. */
export interface MaterialPropertyJSON {
	name: string;
	type: string;
	value: number[];
}

export interface MeshAssetJSON {
	id: AssetId;
	type: "mesh";
	source: MeshDescriptor;
}

export interface MaterialAssetJSON {
	id: AssetId;
	type: "material";
	shader: string;
	name: string;
	properties: MaterialPropertyJSON[];
}

export type AssetJSON = MeshAssetJSON | MaterialAssetJSON;

/** An entity's components, keyed by component *name* (never the numeric
 * component id - see the World README's ids-are-import-order-dependent
 * landmine). Each value is that component's own toJSON output. */
export interface EntityJSON {
	id: number;
	components: Record<string, unknown>;
}

export interface CameraJSON {
	translation: Vec3JSON;
	orientation: QuatJSON;
	fovy: number;
}

/** The camera, ambient light, and background color are private `App` fields,
 * not ECS data - omitting this block would make a loaded scene come back with
 * the wrong camera and lighting. */
export interface EnvironmentJSON {
	ambientLight: Vec3JSON;
	backgroundColor: Vec4JSON;
}

export interface SceneFile {
	format: typeof SCENE_FORMAT;
	version: typeof SCENE_VERSION;
	camera: CameraJSON;
	environment: EnvironmentJSON;
	assets: AssetJSON[];
	entities: EntityJSON[];
}
