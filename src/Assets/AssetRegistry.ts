import { Mesh } from "../Geometry/Mesh";
import {
	Material,
	MaterialProperty,
	MaterialPropertyType,
} from "../Renderer/Material";
import { ShaderProgram } from "../Renderer/Shader";
import { Texture } from "../Renderer/Texture";
import { Renderer } from "../Renderer/Renderer";
import { AssetId } from "./AssetId";

/**
 * How a mesh was made. The only sources M1 knows about are the ones already
 * built into the app; an imported-glTF source is added when M7 needs one.
 */
export type MeshDescriptor =
	| { kind: "primitive"; primitive: "sphere" | "box" }
	| { kind: "builtin"; name: string };

/** How a material was made: a shader id plus the uniform values it feeds it. */
export interface MaterialDescriptor {
	shader: "lit";
	name: string;
	properties: MaterialProperty[];
}

interface MeshEntry {
	descriptor: MeshDescriptor;
	live: Mesh;
}

interface MaterialEntry {
	descriptor: MaterialDescriptor;
	live: Material;
}

/**
 * Resolves asset ids to the live, GPU-backed objects (`Mesh`, `Material`) that
 * use them, and is the only place allowed to construct or mutate those
 * objects.
 *
 * This exists because components must hold pure data, never live GPU handles
 * (see `src/ecs/README.md`): `MeshRef`/`MaterialRef` store an `AssetId`, and
 * whatever needs the actual `Mesh`/`Material` - the RenderSystem, the
 * Inspector - resolves it here.
 *
 * Each entry also keeps the *descriptor* that describes how the asset was
 * made. That is the serializable half a future `.ffscene` file writes (see
 * `docs/scene-creator-roadmap.md`), so edits must go through
 * `setMaterialProperty` rather than mutating the live `Material` directly -
 * otherwise the descriptor and the live object drift apart and a saved scene
 * would silently lose the edit.
 */
class AssetRegistry {
	private _meshes = new Map<AssetId, MeshEntry>();
	private _materials = new Map<AssetId, MaterialEntry>();
	private _nextMaterialId = 1;

	// --- meshes --------------------------------------------------------

	/**
	 * Registers a mesh under a caller-chosen, stable id. Used for the built-in
	 * meshes, which are singletons known up front - unlike materials, which are
	 * minted per use (see `createMaterial`).
	 *
	 * @param id - The stable id to register the mesh under (e.g. "mesh/sphere")
	 * @param descriptor - How the mesh was made
	 * @param mesh - The live, GPU-backed mesh
	 */
	registerMesh(id: AssetId, descriptor: MeshDescriptor, mesh: Mesh): AssetId {
		if (this._meshes.has(id)) {
			throw new Error(`Asset id "${id}" is already registered.`);
		}
		this._meshes.set(id, { descriptor, live: mesh });
		return id;
	}

	/** Resolves a mesh id to its live, GPU-backed `Mesh`. */
	resolveMesh(id: AssetId): Mesh {
		return this.meshEntry(id).live;
	}

	/** The descriptor a mesh was registered with. */
	meshDescriptor(id: AssetId): MeshDescriptor {
		return this.meshEntry(id).descriptor;
	}

	/**
	 * Frees a mesh's GPU buffers and drops it from the registry. Only
	 * meaningful for a mesh nothing else references - never call this on a
	 * shared built-in mesh while another entity still uses it.
	 *
	 * @param renderer - The renderer to free GPU resources through, or
	 * undefined if no canvas is attached (nothing was ever uploaded, so this
	 * just drops the registry entry)
	 * @param id - The mesh to dispose
	 */
	disposeMesh(renderer: Renderer | undefined, id: AssetId): void {
		const entry = this._meshes.get(id);
		if (!entry) {
			return;
		}
		if (renderer) {
			renderer.deleteVertexBuffer(entry.live.vertexBuffer);
			renderer.deleteIndexBuffer(entry.live.indexBuffer);
		}
		this._meshes.delete(id);
	}

	private meshEntry(id: AssetId): MeshEntry {
		const entry = this._meshes.get(id);
		if (!entry) {
			throw new Error(`No mesh registered for asset id "${id}".`);
		}
		return entry;
	}

	// --- materials -------------------------------------------------------

	/**
	 * Creates and registers a new material, minting a fresh id. Every call
	 * mints its own id, even if two callers pass identical properties - that
	 * is what keeps "recolor this one ball" from silently recoloring every
	 * ball that happens to share a color. Shared materials should be an
	 * explicit user action later, not an accident of two entities being
	 * spawned with the same call.
	 *
	 * @param name - A human-readable name for the material
	 * @param program - The shader program the material uses
	 * @param properties - The material's uniform values
	 */
	createMaterial(
		name: string,
		program: ShaderProgram,
		properties: MaterialProperty[]
	): AssetId {
		const id: AssetId = `mat/${this._nextMaterialId++}`;
		const live = new Material(name, program, properties.map(cloneProperty));
		const descriptor: MaterialDescriptor = {
			shader: "lit",
			name,
			properties: properties.map(cloneProperty),
		};
		this._materials.set(id, { descriptor, live });
		return id;
	}

	/** Resolves a material id to its live `Material`. */
	resolveMaterial(id: AssetId): Material {
		return this.materialEntry(id).live;
	}

	/** The descriptor a material was created with. */
	materialDescriptor(id: AssetId): MaterialDescriptor {
		return this.materialEntry(id).descriptor;
	}

	/**
	 * The only sanctioned way to edit a material property. Updates the live
	 * object (so the change renders immediately) and the descriptor (so a
	 * future save writes it) together - editing just one is the single easiest
	 * way to get this registry wrong.
	 *
	 * @param id - The material to edit
	 * @param propertyName - The uniform name to update (e.g. "u_color")
	 * @param value - The new value
	 */
	setMaterialProperty(
		id: AssetId,
		propertyName: string,
		value: MaterialProperty["value"]
	): void {
		const entry = this.materialEntry(id);
		entry.live.setProperty(propertyName, value);
		const descriptorProperty = entry.descriptor.properties.find(
			(property) => property.name === propertyName
		);
		if (descriptorProperty) {
			descriptorProperty.value = value;
		}
	}

	/**
	 * Frees a material's GPU-owned properties and drops it from the registry.
	 * The shared lit shader program is never deleted here - a Material never
	 * uniquely owns its program, so disposing one material must not pull the
	 * program out from under every other material that still uses it. Only a
	 * texture property (currently unused - see the roadmap's texturing
	 * milestone) is uniquely owned by a material and needs a GPU delete.
	 *
	 * @param renderer - The renderer to free GPU resources through, or
	 * undefined if no canvas is attached (nothing was ever uploaded, so this
	 * just drops the registry entry)
	 * @param id - The material to dispose
	 */
	disposeMaterial(renderer: Renderer | undefined, id: AssetId): void {
		const entry = this._materials.get(id);
		if (!entry) {
			return;
		}
		if (renderer) {
			entry.live.properties.forEach((property: MaterialProperty) => {
				if (property.type === MaterialPropertyType.TEXTURE) {
					renderer.deleteTexture(property.value as Texture);
				}
			});
		}
		this._materials.delete(id);
	}

	private materialEntry(id: AssetId): MaterialEntry {
		const entry = this._materials.get(id);
		if (!entry) {
			throw new Error(`No material registered for asset id "${id}".`);
		}
		return entry;
	}
}

function cloneProperty(property: MaterialProperty): MaterialProperty {
	return { ...property };
}

/**
 * The app's single asset registry. Firefly only ever has one document open at
 * a time (there is no multi-scene-tab concept), so one shared instance - the
 * same pattern `prefabs.ts` already uses for the shared lit shader program -
 * is simpler than threading a registry instance through World, RenderSystem,
 * and every panel. Revisit if a future milestone needs more than one.
 */
export const assetRegistry = new AssetRegistry();

export { AssetRegistry };
