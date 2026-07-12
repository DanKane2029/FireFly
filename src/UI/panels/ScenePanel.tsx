import { useEffect, useRef } from "react";
import { useApp } from "../EngineContext";

/**
 * The panel that displays the 3D scene - the WebGL view that used to be the
 * whole app. It owns a `<canvas>`, hands it to the App (which builds the
 * Renderer/Picker and wires mouse + keyboard input), drives the render loop, and
 * keeps the canvas and framebuffer sized to the panel with a ResizeObserver.
 *
 * The App/Scene outlive this component, so the world survives the panel being
 * resized, re-docked, or closed and reopened.
 */
export function ScenePanel() {
	const app = useApp();
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!container || !canvas) {
			return;
		}

		// Size the canvas to the panel before attaching so the framebuffer is
		// allocated at the right resolution; the ResizeObserver keeps it current.
		const rect = container.getBoundingClientRect();
		canvas.width = Math.max(1, Math.floor(rect.width));
		canvas.height = Math.max(1, Math.floor(rect.height));

		app.attachCanvas(canvas);

		let frame = requestAnimationFrame(function loop() {
			app.render();
			frame = requestAnimationFrame(loop);
		});

		const observer = new ResizeObserver((entries) => {
			const size = entries[0].contentRect;
			app.resize(size.width, size.height);
		});
		observer.observe(container);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			app.detachCanvas();
		};
	}, [app]);

	return (
		<div
			ref={containerRef}
			style={{ width: "100%", height: "100%", overflow: "hidden" }}
		>
			<canvas
				ref={canvasRef}
				tabIndex={0}
				style={{
					width: "100%",
					height: "100%",
					display: "block",
					outline: "none",
				}}
			/>
		</div>
	);
}
