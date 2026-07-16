import { mat4, vec3 } from "gl-matrix";
import { Controller } from "./Controller";
import { App } from "../App/App";
import { spawnCamera } from "../ecs/prefabs";
import { transformFromMatrix } from "../ecs/components/Transform";

// How far in front of the viewport camera a newly added camera entity
// starts - close enough to be immediately visible/selectable without
// needing to hunt for it, matching AddCube's spawn-where-you-are feel.
const SPAWN_DISTANCE = 1;

/**
 * Adds a camera entity to the world on click, positioned and oriented to
 * match the current viewport camera - so it starts out pointed at roughly
 * what you're already looking at, a reasonable default to then move into
 * place. No drag-to-resize the way AddCube has; a camera has no size of its
 * own to set.
 */
class AddCameraController implements Controller {
	onMouseDown(app: App, event: MouseEvent): void {
		// Right button is reserved for the always-on camera orbit (see
		// OrbitalControls); only the left button drives this tool.
		if (event.button !== 0) {
			return;
		}

		// -Z is this engine's forward convention (see Math/Ray.ts and the
		// orbit camera's own lookAt logic).
		const forward = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(0, 0, -1),
			app.camera.orientation
		);
		const position = vec3.scaleAndAdd(
			vec3.create(),
			app.camera.translation,
			forward,
			SPAWN_DISTANCE
		);

		// Reuse the same translation+orientation the viewport camera already
		// has (transformFromMatrix decomposes it into the Euler-degrees form
		// Transform stores), rather than re-deriving Euler angles by hand.
		const lookMatrix = mat4.fromRotationTranslation(
			mat4.create(),
			app.camera.orientation,
			position
		);
		const { translation, rotation } = transformFromMatrix(lookMatrix);

		spawnCamera(app.world, { translation, rotation });
		app.notifyChanged();
	}
}

export { AddCameraController };
