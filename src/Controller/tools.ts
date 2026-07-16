import SvgIcon from "@mui/material/SvgIcon";
import NearMeIcon from "@mui/icons-material/NearMe";
import AddBoxIcon from "@mui/icons-material/AddBox";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { Controller } from "./Controller";
import { GizmoController } from "./GizmoController";
import { AddCubeController } from "./AddCube";
import { AddCameraController } from "./AddCamera";

/**
 * The swappable "what does the left mouse button do" tools. Distinct from the
 * camera (OrbitalControls), which is always-on and bound to the right mouse
 * button - see App's setTool/_cameraController split.
 */
type ToolId = "select" | "addCube" | "addCamera";

interface ToolBinding {
	id: ToolId;
	/** Shown on the toolbar button and its tooltip. */
	label: string;
	/** Keyboard accelerator, matched against KeyboardEvent.key. */
	key: string;
	/** Longer description, e.g. for a tooltip or help legend. */
	description: string;
	icon: typeof SvgIcon;
	create: () => Controller;
}

/**
 * The single source of truth for the available tools: App's keyboard
 * handler and the ScenePanel's toolbar both read this list, so a key, its
 * label, and its behavior can never drift out of sync with each other.
 */
const TOOLS: ToolBinding[] = [
	{
		id: "select",
		label: "Select / Move",
		key: "s",
		description:
			"Click to select an object; drag its axis handles to move it.",
		icon: NearMeIcon,
		create: () => new GizmoController(),
	},
	{
		id: "addCube",
		label: "Add Cube",
		key: "c",
		description: "Click to add a cube; drag to size it before releasing.",
		icon: AddBoxIcon,
		create: () => new AddCubeController(),
	},
	{
		id: "addCamera",
		label: "Add Camera",
		key: "v",
		description:
			"Click to add a camera, positioned where the viewport is currently looking.",
		icon: CameraAltIcon,
		create: () => new AddCameraController(),
	},
];

const DEFAULT_TOOL_ID: ToolId = "select";

function toolById(id: ToolId): ToolBinding {
	const tool = TOOLS.find((t) => t.id === id);
	if (!tool) {
		throw new Error(`Unknown tool id "${id}".`);
	}
	return tool;
}

function toolForKey(key: string): ToolBinding | undefined {
	return TOOLS.find((t) => t.key === key);
}

export { ToolId, ToolBinding, TOOLS, DEFAULT_TOOL_ID, toolById, toolForKey };
