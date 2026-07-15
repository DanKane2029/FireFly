import { defineComponent } from "../Component";
import { AssetId } from "../../Assets/AssetId";

/**
 * References the material (shader program + uniform values, e.g. color) an
 * entity is drawn with, by asset id rather than the live `Material`
 * (components hold data, not GPU handles - resolve the id through
 * `AssetRegistry`). Materials are shared, named assets (see the Materials
 * panel): multiple entities can intentionally hold the same id, in which
 * case editing that material updates every one of them - the same sharing
 * relationship a MeshRef already has with a mesh.
 */
export interface MaterialRefData {
	material: AssetId;
}

export const MaterialRef = defineComponent<MaterialRefData>("MaterialRef");
