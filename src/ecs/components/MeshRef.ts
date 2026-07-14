import { defineComponent } from "../Component";
import { AssetId } from "../../Assets/AssetId";

/**
 * References the geometry an entity is drawn with, by asset id rather than
 * the live `Mesh` (components hold data, not GPU handles - resolve the id
 * through `AssetRegistry`). Multiple entities can share one mesh id (e.g.
 * every ball of the snowman references "mesh/sphere"), so the geometry is
 * uploaded to the GPU once and drawn many times.
 */
export interface MeshRefData {
	mesh: AssetId;
}

export const MeshRef = defineComponent<MeshRefData>("MeshRef");
