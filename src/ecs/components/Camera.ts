import { defineComponent } from "../Component";

/**
 * Marks an entity as a camera you can render the scene through (see the
 * Render panel), in addition to being a normal scene object with a Transform
 * (its position/orientation) like anything else. Aspect ratio is
 * deliberately not stored here - unlike fov/near/far it isn't part of the
 * camera's own identity, it's derived from whatever the Render panel's own
 * viewport size is at render time (the same reasoning the interactive orbit
 * camera's aspectRatio already follows - see Renderer/Camera.ts).
 *
 * Named `CameraData`/`Camera` at the component level, but imported as
 * `CameraComponent` at most use sites to avoid colliding with
 * Renderer/Camera.ts's `Camera` class - the two are related but distinct:
 * this is the persisted per-entity data, that's the live math/matrix object
 * built from it on demand.
 */
export interface CameraData {
	fov: number;
	near: number;
	far: number;
}

export const CameraComponent = defineComponent<CameraData>("Camera");
