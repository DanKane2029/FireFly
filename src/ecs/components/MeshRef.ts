import { defineComponent } from "../Component";
import { Mesh } from "../../Geometry/Mesh";

/**
 * References the geometry an entity is drawn with. Multiple entities can share
 * one Mesh (e.g. every ball of the snowman references the same sphere mesh),
 * so the geometry is uploaded to the GPU once and drawn many times.
 */
export interface MeshRefData {
	mesh: Mesh;
}

export const MeshRef = defineComponent<MeshRefData>("MeshRef");
