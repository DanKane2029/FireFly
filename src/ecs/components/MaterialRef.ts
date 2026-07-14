import { defineComponent } from "../Component";
import { AssetId } from "../../Assets/AssetId";

/**
 * References the material (shader program + uniform values, e.g. color) an
 * entity is drawn with, by asset id rather than the live `Material`
 * (components hold data, not GPU handles - resolve the id through
 * `AssetRegistry`). Entities sharing a Mesh usually still have their own
 * material id so they can differ in color while reusing one shader program.
 */
export interface MaterialRefData {
	material: AssetId;
}

export const MaterialRef = defineComponent<MaterialRefData>("MaterialRef");
