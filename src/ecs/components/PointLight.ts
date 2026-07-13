import { defineComponent } from "../Component";

/**
 * Marks an entity as a point light. The RenderSystem gathers every entity that
 * has one and feeds their positions to the lighting shader.
 *
 * It carries no data of its own - the light's position is its entity's
 * Transform translation, exactly like every other spatial thing in the world.
 * A component whose mere presence is the information is called a *tag*: there
 * is nothing to store, so the store just records "this entity is a light".
 *
 * Keeping position in the Transform (rather than on the light) means exactly one
 * place owns "where is this thing", so a light is moved the same way a mesh is,
 * and any future system that moves Transforms moves lights too, for free.
 */
export type PointLightData = Record<string, never>;

export const PointLight = defineComponent<PointLightData>("PointLight");
