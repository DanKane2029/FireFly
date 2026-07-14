import { ChangeEvent } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useEditorStore } from "../EngineContext";
import {
	MaterialProperty,
	MaterialPropertyType,
} from "../../Renderer/Material";
import { MaterialRef } from "../../ecs/components/MaterialRef";
import { Named } from "../../ecs/components/Named";
import { assetRegistry } from "../../Assets/AssetRegistry";

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
 * Edits the material of the currently selected entity. It reads the entity's
 * MaterialRef component from the world and, for now, exposes the `u_color` VEC4
 * uniform via a color swatch; editing it calls `Material.setProperty` and
 * notifies the store, so the change shows in the scene immediately.
 */
export function InspectorPanel() {
	const app = useEditorStore();
	const entity = app.selectedId;
	const materialRef =
		entity !== null ? app.world.get(entity, MaterialRef) : undefined;

	if (entity === null || !materialRef) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
				Select an object to edit its material.
			</Typography>
		);
	}

	const material = assetRegistry.resolveMaterial(materialRef.material);
	const named = app.world.get(entity, Named);
	const colorProp = material.properties.find(
		(prop: MaterialProperty) =>
			prop.name === "u_color" && prop.type === MaterialPropertyType.VEC4
	);

	return (
		<Box sx={{ p: 1.5, height: "100%", bgcolor: "background.paper" }}>
			<Typography variant="caption" color="text.secondary">
				{named?.name ?? `Entity #${entity}`} — {material.name}
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
							const current =
								colorProp.value as ArrayLike<number>;
							const alpha = current[3] ?? 1;
							assetRegistry.setMaterialProperty(
								materialRef.material,
								"u_color",
								[r, g, b, alpha]
							);
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
