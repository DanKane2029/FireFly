import { vec2 } from "gl-matrix";

import { BackendKind, RenderBackend } from "./RenderBackend";
import { WebGLBackend } from "./webgl/WebGLBackend";
import { WebGPUBackend } from "./webgpu/WebGPUBackend";

/**
 * Which backend the user asked for. "auto" prefers WebGPU and quietly falls
 * back to WebGL2, which is what a first-time visitor gets.
 */
export type BackendPreference = BackendKind | "auto";

const STORAGE_KEY = "firefly.backend";

/**
 * Reads the stored backend preference, defaulting to "auto".
 *
 * Persisted so a deliberate choice survives a reload - the interesting case
 * being someone who picked WebGL2 on purpose to compare the two, and would be
 * annoyed to be handed back to WebGPU on every refresh.
 */
export function loadBackendPreference(): BackendPreference {
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored === "webgl2" || stored === "webgpu" || stored === "auto") {
			return stored;
		}
	} catch {
		// localStorage throws in some privacy modes. A preference is a nicety,
		// not something worth failing startup over.
	}
	return "auto";
}

/** Stores the backend preference for the next session. */
export function saveBackendPreference(preference: BackendPreference): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, preference);
	} catch {
		// See loadBackendPreference.
	}
}

/** Whether this browser exposes WebGPU at all. Used to disable the switcher
 * rather than offering a choice that cannot work. */
export function isWebGPUAvailable(): boolean {
	return typeof navigator !== "undefined" && navigator.gpu !== undefined;
}

/**
 * Builds a render backend for a canvas.
 *
 * **A canvas can only ever have one context type.** `getContext("webgl2")` on
 * a canvas that has already returned a WebGPU context yields null, forever,
 * and no amount of cleanup undoes it. So the caller must hand over a *fresh*
 * canvas element whenever the backend changes - the Scene panel does this by
 * keying its `<canvas>` on the backend kind, so React mounts a new one. If
 * this function is ever seen returning WebGL when WebGPU was clearly
 * available, a recycled canvas is the first thing to suspect.
 *
 * @param canvas - A canvas with no context yet
 * @param preference - What to try. An explicit "webgpu" that fails still falls
 * back to WebGL2 rather than leaving the app with nothing to draw with; the
 * failure is reported through the returned `fellBack` flag so the UI can say
 * so.
 */
export async function createBackend(
	canvas: HTMLCanvasElement,
	preference: BackendPreference
): Promise<{ backend: RenderBackend; fellBack: boolean }> {
	const size = vec2.fromValues(canvas.width, canvas.height);

	if (preference === "auto" || preference === "webgpu") {
		const backend = await WebGPUBackend.create(canvas);
		if (backend) {
			return { backend, fellBack: false };
		}
		if (preference === "webgpu") {
			console.warn(
				"WebGPU was requested but is unavailable on this device; " +
					"falling back to WebGL2."
			);
		}
		return { backend: createWebGLBackend(canvas, size), fellBack: true };
	}

	return { backend: createWebGLBackend(canvas, size), fellBack: false };
}

/** Acquires a WebGL2 context and wraps it. Throws if even WebGL2 is missing -
 * at that point there is genuinely nothing to render with. */
function createWebGLBackend(
	canvas: HTMLCanvasElement,
	size: vec2
): RenderBackend {
	// antialias must be false: the default framebuffer would otherwise be
	// multisampled, and blitFramebuffer (used to copy the rendered image to
	// the canvas) cannot write into a multisampled framebuffer.
	const gl = canvas.getContext("webgl2", {
		preserveDrawingBuffer: true,
		antialias: false,
	});
	if (gl === null) {
		throw new Error("Neither WebGPU nor WebGL2 is supported in this browser.");
	}
	return new WebGLBackend(gl, size);
}
