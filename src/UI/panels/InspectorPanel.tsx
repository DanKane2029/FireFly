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
 * `u_color` VEC4 uniform via a color picker; editing it calls
 * `Material.setProperty` and notifies the store, so the change shows in the
 * scene immediately. This proves two-way editing and is the template for a
 * fuller material editor later.
 */
export function InspectorPanel() {
	const app = useEditorStore();
	const object = app.selectedObject;

	if (!object) {
		return (
			<div style={{ padding: 8, opacity: 0.6, font: "13px sans-serif" }}>
				Select an object to edit its material.
			</div>
		);
	}

	const colorProp = object.material.properties.find(
		(prop: MaterialProperty) =>
			prop.name === "u_color" && prop.type === MaterialPropertyType.VEC4
	);

	return (
		<div style={{ padding: 8, font: "13px sans-serif" }}>
			<div style={{ marginBottom: 8, opacity: 0.7 }}>
				{object.name || `Object #${object.id}`} — {object.material.name}
			</div>
			{colorProp ? (
				<label
					style={{ display: "flex", alignItems: "center", gap: 8 }}
				>
					Color
					<input
						type="color"
						value={toHex(colorProp.value as ArrayLike<number>)}
						onChange={(event) => {
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
					/>
				</label>
			) : (
				<div style={{ opacity: 0.6 }}>
					This material has no editable color.
				</div>
			)}
		</div>
	);
}
