import { ChangeEvent } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useEditorStore } from "../EngineContext";
import { MaterialProperty, MaterialPropertyType } from "../../Renderer/Material";

/** Formats a 0..1 rgb(a) color as a "#rrggbb" hex string for <input type=color>. */
function toHex(color: ArrayLike<number>): string {
	const channel = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

/** Parses a "#rrggbb" hex string back into 0..1 rgb components. */
function fromHex(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Edits the material of the currently selected object. For now it exposes the
 * `u_color` VEC4 uniform via a color swatch; editing it calls
 * `Material.setProperty` and notifies the store, so the change shows in the
 * scene immediately. Styled with Material UI (the Firefly theme) and meant as
 * the template for a fuller material editor later.
 */
export function InspectorPanel() {
	const app = useEditorStore();
	const object = app.selectedObject;

	if (!object) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
				Select an object to edit its material.
			</Typography>
		);
	}

	const colorProp = object.material.properties.find(
		(prop: MaterialProperty) =>
			prop.name === "u_color" && prop.type === MaterialPropertyType.VEC4
	);

	return (
		<Box sx={{ p: 1.5, height: "100%", bgcolor: "background.paper" }}>
			<Typography variant="caption" color="text.secondary">
				{object.name || `Object #${object.id}`} — {object.material.name}
			</Typography>

			{colorProp ? (
				<Stack
					direction="row"
					spacing={1}
					alignItems="center"
					sx={{ mt: 1.5 }}
				>
					<Typography variant="body2">Color</Typography>
					<Box
						component="input"
						type="color"
						value={toHex(colorProp.value as ArrayLike<number>)}
						onChange={(event: ChangeEvent<HTMLInputElement>) => {
							const [r, g, b] = fromHex(event.target.value);
							const current = colorProp.value as ArrayLike<number>;
							const alpha = current[3] ?? 1;
							object.material.setProperty("u_color", [
								r,
								g,
								b,
								alpha,
							]);
							app.notifyChanged();
						}}
						sx={{
							width: 40,
							height: 28,
							p: 0,
							border: 1,
							borderColor: "divider",
							borderRadius: 1,
							background: "none",
							cursor: "pointer",
						}}
					/>
				</Stack>
			) : (
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mt: 1.5 }}
				>
					This material has no editable color.
				</Typography>
			)}
		</Box>
	);
}
