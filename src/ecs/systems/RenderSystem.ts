import { mat4, vec3 } from "gl-matrix";
import { World } from "../World";
import { Renderer, Renderable } from "../../Renderer/Renderer";
import { Camera } from "../../Renderer/Camera";
import { PointLight } from "../../Renderer/Light";
import { Transform, transformMatrix } from "../components/Transform";
import { MeshRef } from "../components/MeshRef";
import { MaterialRef } from "../components/MaterialRef";

/**
 * Everything the render pass needs from outside the ECS world: the GPU backend,
 * the camera to view from, and the lighting. (Camera and lights are kept as
 * plain resources for now rather than entities/components.)
 */
export interface RenderContext {
	renderer: Renderer;
	camera: Camera;
	ambientLight: vec3;
	lights: PointLight[];
}

/**
 * Draws every renderable entity. It queries the world for entities that have a
 * Transform, a MeshRef, and a MaterialRef, turns each into a Renderable (its
 * world matrix + GPU buffers + material + entity id), and hands the batch to the
 * Renderer. The entity id becomes the picking id, so a click resolves straight
 * back to the entity.
 */
export function renderSystem(world: World, context: RenderContext): void {
	const renderables: Renderable[] = world
		.query(Transform, MeshRef, MaterialRef)
		.map(([entity, transform, meshRef, materialRef]) => ({
			id: entity,
			transform: transformMatrix(transform, mat4.create()),
			material: materialRef.material,
			vertexBuffer: meshRef.mesh.vertexBuffer,
			indexBuffer: meshRef.mesh.indexBuffer,
		}));

	context.renderer.render(
		renderables,
		context.camera,
		context.ambientLight,
		context.lights
	);
}
