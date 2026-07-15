import SvgIcon from "@mui/material/SvgIcon";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import { GizmoMode } from "../Renderer/GizmoAxis";

export { GizmoMode };

interface GizmoModeBinding {
	id: GizmoMode;
	/** Shown on the toolbar button and its tooltip. */
	label: string;
	/** Keyboard accelerator, matched against KeyboardEvent.key. Distinct from
	 * the top-level tools' keys (s/c, see Controller/tools.ts) since both
	 * registries can be active listeners at once. */
	key: string;
	/** Longer description, e.g. for a tooltip. */
	description: string;
	icon: typeof SvgIcon;
}

/**
 * The single source of truth for the gizmo's three drag modes: App's
 * keyboard handler and the ScenePanel's toolbar both read this list, the
 * same pattern Controller/tools.ts already establishes for the top-level
 * tools - so a key, its label, and its behavior can't drift out of sync.
 */
const GIZMO_MODES: GizmoModeBinding[] = [
	{
		id: "translate",
		label: "Move",
		key: "w",
		description:
			"Drag an axis handle to move the selected object along it.",
		icon: OpenWithIcon,
	},
	{
		id: "rotate",
		label: "Rotate",
		key: "e",
		description:
			"Drag an axis ring to rotate the selected object around it.",
		icon: RotateRightIcon,
	},
	{
		id: "scale",
		label: "Scale",
		key: "r",
		description:
			"Drag an axis handle to scale the selected object along it.",
		icon: AspectRatioIcon,
	},
];

const DEFAULT_GIZMO_MODE_ID: GizmoMode = "translate";

function gizmoModeById(id: GizmoMode): GizmoModeBinding {
	const mode = GIZMO_MODES.find((m) => m.id === id);
	if (!mode) {
		throw new Error(`Unknown gizmo mode id "${id}".`);
	}
	return mode;
}

function gizmoModeForKey(key: string): GizmoModeBinding | undefined {
	return GIZMO_MODES.find((m) => m.key === key);
}

export {
	GizmoModeBinding,
	GIZMO_MODES,
	DEFAULT_GIZMO_MODE_ID,
	gizmoModeById,
	gizmoModeForKey,
};
