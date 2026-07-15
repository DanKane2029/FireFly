import { mat4, vec3 } from "gl-matrix";
import { World } from "../World";
import { Renderer, Renderable } from "../../Renderer/Renderer";
import { Camera } from "../../Renderer/Camera";
import { Transform, transformMatrix } from "../components/Transform";
import { MeshRef } from "../components/MeshRef";
import { MaterialRef } from "../components/MaterialRef";
import { PointLight } from "../components/PointLight";
import { assetRegistry } from "../../Assets/AssetRegistry";

/**
 * Everything the render pass needs from outside the ECS world: the GPU backend,
 * the camera to view from, and the ambient light. The point lights are *not*
 * here - they live in the world as entities and the system gathers them itself.
 * (The camera stays a plain resource: there is exactly one of it.)
 */
export interface RenderContext {
	renderer: Renderer;
	camera: Camera;
	ambientLight: vec3;
	/** Extra Renderables drawn in a second, depth-test-off pass after the
	 * scene - currently just the transform gizmo's axis handles (see
	 * Gizmo.ts). Not ECS data, so RenderSystem doesn't build this itself; the
	 * caller (App.render) does and just hands it through, keeping
	 * RenderSystem's own job strictly "turn ECS entities into Renderables". */
	overlayRenderables?: Renderable[];
	/** The selection outline's Renderable (see Outline.ts), if anything is
	 * selected. Same reasoning as overlayRenderables - not ECS data, App.render
	 * builds it, RenderSystem just forwards it. */
	outlineRenderables?: Renderable[];
}

/**
 * Draws every renderable entity. It queries the world for entities that have a
 * Transform, a MeshRef, and a MaterialRef, turns each into a Renderable (its
 * world matrix + GPU buffers + material + entity id), and hands the batch to the
 * Renderer. The entity id becomes the picking id, so a click resolves straight
 * back to the entity.
 *
 * Lighting is a second query: every entity tagged as a PointLight contributes
 * its Transform translation as a light position. Nothing registers a light with
 * the renderer - spawning an entity with the tag is all it takes to light the
 * scene, and destroying it is all it takes to turn the light off.
 */
export function renderSystem(world: World, context: RenderContext): void {
	const renderables: Renderable[] = world
		.query(Transform, MeshRef, MaterialRef)
		.map(([entity, transform, meshRef, materialRef]) => {
			const mesh = assetRegistry.resolveMesh(meshRef.mesh);
			return {
				id: entity,
				transform: transformMatrix(transform, mat4.create()),
				material: assetRegistry.resolveMaterial(materialRef.material),
				vertexBuffer: mesh.vertexBuffer,
				indexBuffer: mesh.indexBuffer,
			};
		});

	const lightPositions: vec3[] = world
		.query(Transform, PointLight)
		.map(([, transform]) => transform.translation);

	context.renderer.render(
		renderables,
		context.camera,
		context.ambientLight,
		lightPositions,
		context.overlayRenderables,
		context.outlineRenderables
	);
}
