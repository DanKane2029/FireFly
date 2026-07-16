import { useEffect, useRef, useState } from "react";
import {
	Box,
	FormControl,
	InputLabel,
	MenuItem,
	Select,
	SelectChangeEvent,
	Typography,
} from "@mui/material";
import { useApp, useEditorStore } from "../EngineContext";
import { Entity } from "../../ecs/World";
import { CameraComponent } from "../../ecs/components/Camera";
import { Named } from "../../ecs/components/Named";
import { OffscreenRenderTarget } from "../../Renderer/Renderer";

function imageDataFrom(
	pixels: Uint8Array,
	width: number,
	height: number
): ImageData {
	return new ImageData(
		new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength),
		width,
		height
	);
}

/**
 * A live "final" render of the scene through a camera entity. Unlike the
 * Scene panel, editor-only visual aids (gizmo handles, camera icons - see
 * EditorOnly.ts) are excluded, so this shows what a shipped render would
 * actually look like. Not a singleton panel - multiple instances can each
 * watch a different camera.
 *
 * Draws to a plain 2D `<canvas>`, not a WebGL one: this engine's GPU resource
 * classes are tied to a single WebGL context (see Renderer.ts's
 * OffscreenRenderTarget doc comment), so this panel reuses the Scene panel's
 * context via App.renderThroughCamera, which renders into an offscreen
 * framebuffer and reads the pixels back with readPixels.
 */
export function RenderPanel() {
	const app = useApp();
	useEditorStore();

	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const targetRef = useRef<OffscreenRenderTarget | null>(null);
	// Which Scene-panel-attach "generation" targetRef's target was created
	// under - see App.rendererGeneration's doc comment for why a stale target
	// must never be reused against a new WebGL context, and must not be
	// deleted through the new one either (its handles belong to the old,
	// already-discarded context).
	const targetGenerationRef = useRef<number>(-1);

	const [selectedCamera, setSelectedCamera] = useState<Entity | null>(null);
	// Read fresh inside the render loop below without restarting its effect
	// (and therefore the render target's lifecycle) on every dropdown change.
	const selectedCameraRef = useRef<Entity | null>(null);
	selectedCameraRef.current = selectedCamera;

	const cameras = app.world.query(CameraComponent).map(([entity]) => ({
		entity,
		name: app.world.get(entity, Named)?.name ?? `Camera ${entity}`,
	}));

	// Keep the selection valid as cameras are added/removed - default to the
	// first available camera, and drop the selection if its entity is gone.
	useEffect(() => {
		if (
			selectedCamera !== null &&
			cameras.some((c) => c.entity === selectedCamera)
		) {
			return;
		}
		setSelectedCamera(cameras.length > 0 ? cameras[0].entity : null);
	}, [selectedCamera, cameras]);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		const rect = container.getBoundingClientRect();
		canvas.width = Math.max(1, Math.floor(rect.width));
		canvas.height = Math.max(1, Math.floor(rect.height));

		let frame = requestAnimationFrame(function loop() {
			if (app.isAttached) {
				if (targetGenerationRef.current !== app.rendererGeneration) {
					// The old target (if any) belonged to a context that no
					// longer exists - just drop the reference rather than
					// calling deleteRenderTarget, which would issue GL calls
					// against the *new* context using handles from the old one.
					targetRef.current = app.createRenderTarget(
						canvas.width,
						canvas.height
					);
					targetGenerationRef.current = app.rendererGeneration;
				} else if (
					targetRef.current &&
					(targetRef.current.width !== canvas.width ||
						targetRef.current.height !== canvas.height)
				) {
					app.resizeRenderTarget(
						targetRef.current,
						canvas.width,
						canvas.height
					);
				}
			} else {
				targetRef.current = null;
			}

			const target = targetRef.current;
			const cameraEntity = selectedCameraRef.current;
			if (target && cameraEntity !== null) {
				const result = app.renderThroughCamera(target, cameraEntity);
				if (result) {
					ctx.putImageData(
						imageDataFrom(result.pixels, result.width, result.height),
						0,
						0
					);
				}
			}

			frame = requestAnimationFrame(loop);
		});

		// Only the canvas's backing-store size is updated here; the render
		// loop above notices the mismatch against the current target's size
		// and resizes it on its next tick (a one-frame lag that's never
		// visible), keeping every target mutation on that single loop instead
		// of racing it from a second callback.
		const observer = new ResizeObserver((entries) => {
			const size = entries[0].contentRect;
			canvas.width = Math.max(1, Math.floor(size.width));
			canvas.height = Math.max(1, Math.floor(size.height));
		});
		observer.observe(container);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			if (targetRef.current) {
				app.deleteRenderTarget(targetRef.current);
				targetRef.current = null;
			}
		};
	}, [app]);

	const emptyMessage = !app.isAttached
		? "Open the Scene panel first."
		: cameras.length === 0
		? "No camera in the scene — add one from the toolbar."
		: null;

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
			}}
		>
			<Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
				<FormControl size="small" fullWidth disabled={cameras.length === 0}>
					<InputLabel id="render-panel-camera-label">Camera</InputLabel>
					<Select
						labelId="render-panel-camera-label"
						label="Camera"
						value={selectedCamera !== null ? String(selectedCamera) : ""}
						onChange={(event: SelectChangeEvent) => {
							const value = event.target.value;
							setSelectedCamera(value === "" ? null : Number(value));
						}}
					>
						{cameras.map((c) => (
							<MenuItem key={c.entity} value={String(c.entity)}>
								{c.name}
							</MenuItem>
						))}
					</Select>
				</FormControl>
			</Box>
			<Box
				ref={containerRef}
				sx={{ position: "relative", flex: 1, overflow: "hidden" }}
			>
				<canvas
					ref={canvasRef}
					style={{ width: "100%", height: "100%", display: "block" }}
				/>
				{emptyMessage && (
					<Box
						sx={{
							position: "absolute",
							inset: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<Typography variant="body2" sx={{ color: "grey.400" }}>
							{emptyMessage}
						</Typography>
					</Box>
				)}
			</Box>
		</Box>
	);
}
