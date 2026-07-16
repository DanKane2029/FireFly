import { ChangeEvent, useState } from "react";
import {
	Box,
	Divider,
	IconButton,
	InputAdornment,
	Stack,
	SxProps,
	TextField,
	Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { useEditorStore } from "../EngineContext";
import {
	MaterialProperty,
	MaterialPropertyType,
} from "../../Renderer/Material";
import { MaterialRef } from "../../ecs/components/MaterialRef";
import { Named } from "../../ecs/components/Named";
import { Transform, TransformData } from "../../ecs/components/Transform";
import { CameraComponent, CameraData } from "../../ecs/components/Camera";
import { assetRegistry } from "../../Assets/AssetRegistry";
import { toHex, fromHex } from "../colorHex";

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
// "0" (e.g. "-0.3" rendered as "-0."). The native spinners are hidden (too
// small to hit reliably anyway) in favor of the custom +/- buttons below;
// the input's own padding is shrunk to reclaim more of that width for
// digits, and the value is centered now that it isn't flush against a
// spinner. Each field also flexes evenly across the row instead of a fixed
// width, so three of them plus gaps never exceeds the row's actual width.
const NUMBER_FIELD_SX: SxProps = {
	flex: 1,
	minWidth: 0,
	"& .MuiOutlinedInput-input": {
		padding: "6px 4px",
		textAlign: "center",
		MozAppearance: "textfield",
	},
	"& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
		{
			WebkitAppearance: "none",
			margin: 0,
		},
};

// A field only has room for +/- buttons alongside the number once it's wide
// enough for both without squeezing the digits back into unreadable
// territory - below that, the buttons just don't render (not "display: none"
// on principle, but because a field this narrow has no business trying to
// fit three things side by side). Measured against the field's own box via a
// CSS container query, not the viewport, so it responds to the Inspector
// panel actually being resized (dockview panels are user-resizable) rather
// than a one-time layout guess.
const STEP_FIELD_CONTAINER_SX: SxProps = {
	containerType: "inline-size",
	flex: 1,
	minWidth: 0,
};

const STEP_BUTTON_SX: SxProps = {
	display: "none",
	"@container (min-width: 108px)": {
		display: "inline-flex",
	},
};

interface NumberFieldProps {
	label: string;
	value: number;
	/** How much a +/- click changes the value by. */
	step?: number;
	onCommit: (value: number) => void;
}

/**
 * A single numeric field: a centered value with +/- buttons that appear on
 * either side once the field is wide enough to fit them (see
 * STEP_FIELD_CONTAINER_SX) - on a field too narrow for that, it's just the
 * number, still fully readable.
 *
 * Shows a short, rounded form of `value` while not focused (see
 * formatNumber), but once focused shows exactly what's being typed instead -
 * otherwise re-rounding the display on every keystroke would fight the user
 * typing a fourth decimal place, or a trailing ".".
 *
 * Commits on every keystroke that parses as a number, and on every +/- click,
 * at full precision - only the *display* is rounded, the committed value
 * never loses precision.
 */
function NumberField({ label, value, step = 0.1, onCommit }: NumberFieldProps) {
	const [editingText, setEditingText] = useState<string | null>(null);
	const displayValue = editingText ?? formatNumber(value);

	return (
		<Box sx={STEP_FIELD_CONTAINER_SX}>
			<TextField
				label={label}
				type="number"
				size="small"
				variant="outlined"
				fullWidth
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
				InputProps={{
					startAdornment: (
						<InputAdornment position="start" sx={STEP_BUTTON_SX}>
							<IconButton
								size="small"
								aria-label={`decrease ${label}`}
								onClick={() => {
									setEditingText(null);
									onCommit(value - step);
								}}
								sx={{ p: 0.25 }}
							>
								<RemoveIcon fontSize="inherit" />
							</IconButton>
						</InputAdornment>
					),
					endAdornment: (
						<InputAdornment position="end" sx={STEP_BUTTON_SX}>
							<IconButton
								size="small"
								aria-label={`increase ${label}`}
								onClick={() => {
									setEditingText(null);
									onCommit(value + step);
								}}
								sx={{ p: 0.25 }}
							>
								<AddIcon fontSize="inherit" />
							</IconButton>
						</InputAdornment>
					),
				}}
			/>
		</Box>
	);
}

interface Vector3RowProps {
	label: string;
	value: ArrayLike<number>;
	/** How much a +/- click changes one axis by (translation/scale want finer
	 * steps than rotation). */
	step?: number;
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
function Vector3Row({ label, value, step, onChangeAxis }: Vector3RowProps) {
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
						step={step}
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
				step={1}
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

interface CameraEditorProps {
	camera: CameraData;
	onChange: () => void;
}

/** Numeric FOV/near/far editing for a camera entity - what the Render panel
 * builds a live Renderer/Camera.ts instance from when rendering through this
 * entity. Same direct-mutate-then-notify pattern as TransformEditor. */
function CameraEditor({ camera, onChange }: CameraEditorProps) {
	return (
		<Box sx={{ mt: 1.5 }}>
			<Typography variant="subtitle2">Camera</Typography>
			<Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
				<NumberField
					label="FOV °"
					value={camera.fov}
					step={1}
					onCommit={(v) => {
						camera.fov = v;
						onChange();
					}}
				/>
				<NumberField
					label="Near"
					value={camera.near}
					step={0.01}
					onCommit={(v) => {
						camera.near = v;
						onChange();
					}}
				/>
				<NumberField
					label="Far"
					value={camera.far}
					step={10}
					onCommit={(v) => {
						camera.far = v;
						onChange();
					}}
				/>
			</Stack>
		</Box>
	);
}

/**
 * Edits the currently selected entity: its Transform (translation/rotation/
 * scale, numerically), its Camera properties (FOV/near/far) if it's a camera
 * entity, and its material's `u_color` uniform via a color swatch. Each
 * section only renders if the entity actually has that component, so this
 * works for entities that have any subset of them.
 */
export function InspectorPanel() {
	const app = useEditorStore();
	const entity = app.selectedId;
	const transform =
		entity !== null ? app.world.get(entity, Transform) : undefined;
	const camera =
		entity !== null ? app.world.get(entity, CameraComponent) : undefined;
	const materialRef =
		entity !== null ? app.world.get(entity, MaterialRef) : undefined;

	if (entity === null || (!transform && !camera && !materialRef)) {
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

			{transform && (camera || materialRef) && (
				<Divider sx={{ my: 1.5 }} />
			)}

			{camera && (
				<CameraEditor
					camera={camera}
					onChange={() => app.notifyChanged()}
				/>
			)}

			{camera && materialRef && <Divider sx={{ my: 1.5 }} />}

			{materialRef &&
				(colorProp ? (
					<>
						<Stack direction="row" spacing={1} alignItems="center">
							<Typography variant="body2">Color</Typography>
							<Box
								component="input"
								type="color"
								value={toHex(
									colorProp.value as ArrayLike<number>
								)}
								onChange={(
									event: ChangeEvent<HTMLInputElement>
								) => {
									const [r, g, b] = fromHex(
										event.target.value
									);
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
						{app.materialUsageCount(materialRef.material) > 1 && (
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: "block", mt: 0.5 }}
							>
								Shared with{" "}
								{app.materialUsageCount(materialRef.material) -
									1}{" "}
								other object
								{app.materialUsageCount(materialRef.material) -
									1 ===
								1
									? ""
									: "s"}{" "}
								- editing this color changes them too.
							</Typography>
						)}
					</>
				) : (
					<Typography variant="body2" color="text.secondary">
						This material has no editable color.
					</Typography>
				))}
		</Box>
	);
}
