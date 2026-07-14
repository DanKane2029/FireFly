import { ChangeEvent, useState } from "react";
import { Box, Divider, Stack, SxProps, TextField, Typography } from "@mui/material";
import { useEditorStore } from "../EngineContext";
import {
	MaterialProperty,
	MaterialPropertyType,
} from "../../Renderer/Material";
import { MaterialRef } from "../../ecs/components/MaterialRef";
import { Named } from "../../ecs/components/Named";
import { Transform, TransformData } from "../../ecs/components/Transform";
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

const AXES = ["X", "Y", "Z"] as const;

/** Rounds a value for display. Transform data is stored as Float32Array, so
 * the raw number is usually noise like -0.30000001192092896 - three decimals
 * is more precision than hand-editing needs and keeps the field short enough
 * to actually read. */
function formatNumber(value: number): string {
	return (Math.round(value * 1000) / 1000).toString();
}

// The Inspector panel is only ~230px of usable width, so three fields on one
// row can't afford the default outlined-field padding (14px each side) *and*
// the native up/down spinner buttons - between the two there was only about
// 45px left to actually draw digits in, which clipped anything longer than
// "0" (e.g. "-0.3" rendered as "-0."). Hiding the spinners (too small to hit
// reliably anyway) and shrinking the padding reclaims that space; each field
// also flexes evenly across the row instead of a fixed width, so three of
// them plus gaps never exceeds the row's actual available width.
const NUMBER_FIELD_SX: SxProps = {
	flex: 1,
	minWidth: 0,
	"& .MuiOutlinedInput-input": {
		padding: "6px 6px",
		MozAppearance: "textfield",
	},
	"& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
		{
			WebkitAppearance: "none",
			margin: 0,
		},
};

interface NumberFieldProps {
	label: string;
	value: number;
	onCommit: (value: number) => void;
}

/**
 * A single numeric field. Shows a short, rounded form of `value` while not
 * focused (see formatNumber), but once focused shows exactly what's being
 * typed instead - otherwise re-rounding the display on every keystroke would
 * fight the user typing a fourth decimal place, or a trailing ".".
 *
 * Commits on every keystroke that parses as a number (same as before this
 * component existed), at full precision - only the *display* is rounded, the
 * committed value never loses precision.
 */
function NumberField({ label, value, onCommit }: NumberFieldProps) {
	const [editingText, setEditingText] = useState<string | null>(null);
	const displayValue = editingText ?? formatNumber(value);

	return (
		<TextField
			label={label}
			type="number"
			size="small"
			variant="outlined"
			value={displayValue}
			inputProps={{ step: "any" }}
			sx={NUMBER_FIELD_SX}
			onFocus={() => setEditingText(formatNumber(value))}
			onBlur={() => setEditingText(null)}
			onChange={(event: ChangeEvent<HTMLInputElement>) => {
				const raw = event.target.value;
				setEditingText(raw);
				const parsed = Number(raw);
				if (raw !== "" && !Number.isNaN(parsed)) {
					onCommit(parsed);
				}
			}}
		/>
	);
}

interface Vector3RowProps {
	label: string;
	value: ArrayLike<number>;
	onChangeAxis: (axis: number, value: number) => void;
}

/**
 * Three numeric fields (X/Y/Z) editing one vec3 in place. Mutating the
 * component's own array and calling `app.notifyChanged()` is enough - unlike
 * a Material property, a Transform is plain ECS data with no registry
 * indirection, so there's nothing else that needs to stay in sync (see
 * AddCubeController.onMouseMove for the same direct-mutation pattern).
 *
 * The label sits on its own line above the fields rather than beside them -
 * the Inspector panel is too narrow to fit a label plus three fields on one
 * row without squeezing the fields down far enough to clip their own values
 * (see NUMBER_FIELD_SX).
 */
function Vector3Row({ label, value, onChangeAxis }: Vector3RowProps) {
	return (
		<Box sx={{ mt: 1 }}>
			<Typography variant="body2" color="text.secondary">
				{label}
			</Typography>
			<Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
				{AXES.map((axis, i) => (
					<NumberField
						key={axis}
						label={axis}
						value={value[i]}
						onCommit={(v) => onChangeAxis(i, v)}
					/>
				))}
			</Stack>
		</Box>
	);
}

interface TransformEditorProps {
	transform: TransformData;
	onChange: () => void;
}

/** Numeric translation/rotation/scale editing - this is the "you can now
 * actually move an object" milestone. Rotation is Euler degrees (see
 * CLAUDE.md's rotation-is-in-degrees trap). */
function TransformEditor({ transform, onChange }: TransformEditorProps) {
	return (
		<Box sx={{ mt: 1.5 }}>
			<Typography variant="subtitle2">Transform</Typography>
			<Vector3Row
				label="Translation"
				value={transform.translation}
				onChangeAxis={(axis, value) => {
					transform.translation[axis] = value;
					onChange();
				}}
			/>
			<Vector3Row
				label="Rotation °"
				value={transform.rotation}
				onChangeAxis={(axis, value) => {
					transform.rotation[axis] = value;
					onChange();
				}}
			/>
			<Vector3Row
				label="Scale"
				value={transform.scale}
				onChangeAxis={(axis, value) => {
					transform.scale[axis] = value;
					onChange();
				}}
			/>
		</Box>
	);
}

/**
 * Edits the currently selected entity: its Transform (translation/rotation/
 * scale, numerically) and its material's `u_color` uniform, via a color
 * swatch. Each section only renders if the entity actually has that
 * component, so this works for entities that have one but not the other.
 */
export function InspectorPanel() {
	const app = useEditorStore();
	const entity = app.selectedId;
	const transform = entity !== null ? app.world.get(entity, Transform) : undefined;
	const materialRef =
		entity !== null ? app.world.get(entity, MaterialRef) : undefined;

	if (entity === null || (!transform && !materialRef)) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
				Select an object to edit it.
			</Typography>
		);
	}

	const named = app.world.get(entity, Named);
	const material = materialRef
		? assetRegistry.resolveMaterial(materialRef.material)
		: undefined;
	const colorProp = material?.properties.find(
		(prop: MaterialProperty) =>
			prop.name === "u_color" && prop.type === MaterialPropertyType.VEC4
	);

	return (
		<Box sx={{ p: 1.5, height: "100%", bgcolor: "background.paper" }}>
			<Typography variant="caption" color="text.secondary">
				{named?.name ?? `Entity #${entity}`}
				{material ? ` — ${material.name}` : ""}
			</Typography>

			{transform && (
				<TransformEditor
					transform={transform}
					onChange={() => app.notifyChanged()}
				/>
			)}

			{transform && materialRef && <Divider sx={{ my: 1.5 }} />}

			{materialRef &&
				(colorProp ? (
					<Stack direction="row" spacing={1} alignItems="center">
						<Typography variant="body2">Color</Typography>
						<Box
							component="input"
							type="color"
							value={toHex(colorProp.value as ArrayLike<number>)}
							onChange={(event: ChangeEvent<HTMLInputElement>) => {
								const [r, g, b] = fromHex(event.target.value);
								const current = colorProp.value as ArrayLike<number>;
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
					<Typography variant="body2" color="text.secondary">
						This material has no editable color.
					</Typography>
				))}
		</Box>
	);
}
