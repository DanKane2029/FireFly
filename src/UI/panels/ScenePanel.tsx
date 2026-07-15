import { useEffect, useRef } from "react";
import {
	Paper,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { useApp, useEditorStore } from "../EngineContext";
import { TOOLS, ToolId } from "../../Controller/tools";
import { GIZMO_MODES, GizmoMode } from "../../Controller/gizmoModes";

/**
 * Which tool the left mouse button uses, and a reminder of the always-on
 * camera controls (right-drag orbit, scroll zoom - see OrbitalControls). Both
 * read from Controller/tools.ts, the same registry App's keyboard handler
 * uses, so the buttons/tooltips/shortcuts shown here can't drift out of sync
 * with what actually happens on click or keypress.
 */
function ToolOverlay() {
	const app = useApp();
	// Re-renders when App.setTool fires its store update, so the highlighted
	// button follows both toolbar clicks and the "s"/"c" keyboard shortcuts.
	useEditorStore();

	return (
		<Paper
			elevation={2}
			sx={{
				position: "absolute",
				top: 8,
				left: 8,
				display: "flex",
				flexDirection: "column",
				gap: 0.5,
				p: 0.5,
				bgcolor: "rgba(30, 30, 30, 0.75)",
			}}
		>
			<ToggleButtonGroup
				orientation="vertical"
				exclusive
				size="small"
				value={app.activeToolId}
				onChange={(_event, value: ToolId | null) => {
					if (value) {
						app.setTool(value);
					}
				}}
			>
				{TOOLS.map((tool) => (
					<ToggleButton key={tool.id} value={tool.id}>
						<Tooltip
							title={`${tool.label} (${tool.key}) — ${tool.description}`}
							placement="right"
						>
							<tool.icon fontSize="small" />
						</Tooltip>
					</ToggleButton>
				))}
			</ToggleButtonGroup>
		</Paper>
	);
}

/**
 * Which of the gizmo's three drag behaviors (move/rotate/scale) is active -
 * only meaningful while the select tool is active, so this only renders
 * then. Reads from Controller/gizmoModes.ts, mirroring ToolOverlay's own
 * single-source-of-truth pattern.
 */
function GizmoModeOverlay() {
	const app = useApp();
	useEditorStore();

	if (app.activeToolId !== "select") {
		return null;
	}

	return (
		<Paper
			elevation={2}
			sx={{
				position: "absolute",
				top: 8,
				left: 56,
				display: "flex",
				gap: 0.5,
				p: 0.5,
				bgcolor: "rgba(30, 30, 30, 0.75)",
			}}
		>
			<ToggleButtonGroup
				orientation="horizontal"
				exclusive
				size="small"
				value={app.activeGizmoModeId}
				onChange={(_event, value: GizmoMode | null) => {
					if (value) {
						app.setGizmoMode(value);
					}
				}}
			>
				{GIZMO_MODES.map((mode) => (
					<ToggleButton key={mode.id} value={mode.id}>
						<Tooltip
							title={`${mode.label} (${mode.key}) — ${mode.description}`}
							placement="bottom"
						>
							<mode.icon fontSize="small" />
						</Tooltip>
					</ToggleButton>
				))}
			</ToggleButtonGroup>
		</Paper>
	);
}

/**
 * A reminder of the always-on camera controls, which have no toolbar button
 * of their own since they're never switched off - see OrbitalControls.
 */
function CameraLegend() {
	return (
		<Paper
			elevation={2}
			sx={{
				position: "absolute",
				bottom: 8,
				left: 8,
				px: 1,
				py: 0.5,
				bgcolor: "rgba(30, 30, 30, 0.75)",
			}}
		>
			<Typography variant="caption" sx={{ color: "grey.300" }}>
				Right-drag: orbit &nbsp;·&nbsp; Scroll: zoom
			</Typography>
		</Paper>
	);
}

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
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				overflow: "hidden",
			}}
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
			<ToolOverlay />
			<GizmoModeOverlay />
			<CameraLegend />
		</div>
	);
}
