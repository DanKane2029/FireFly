import { defineComponent } from "../Component";
import { Material } from "../../Renderer/Material";

/**
 * References the material (shader program + uniform values, e.g. color) an
 * entity is drawn with. Entities sharing a Mesh usually still have their own
 * Material so they can differ in color while reusing one shader program.
 */
export interface MaterialRefData {
	material: Material;
}

export const MaterialRef = defineComponent<MaterialRefData>("MaterialRef");
