import { FunctionComponent } from "react";
import { IDockviewPanelProps } from "dockview";
import { ScenePanel } from "./ScenePanel";
import { ObjectManagerPanel } from "./ObjectManagerPanel";
import { InspectorPanel } from "./InspectorPanel";
import { WorkspacePanel } from "./WorkspacePanel";

/**
 * Metadata describing one dockable panel type. `id` is both the dockview
 * component key and the panel id used when laying out the default workspace.
 */
export interface PanelType {
	id: string;
	title: string;
	component: FunctionComponent<IDockviewPanelProps>;
	/**
	 * If true, only one instance may exist at a time (adding again focuses the
	 * existing one). The Scene panel is a singleton because the App drives a
	 * single WebGL canvas.
	 */
	singleton?: boolean;
}

/**
 * The catalog of available panels. Adding a new panel is a one-line entry here
 * (plus its component); the nav bar's "Add Panel" menu enumerates this list.
 */
export const PANEL_TYPES: PanelType[] = [
	{ id: "scene", title: "Scene", component: ScenePanel, singleton: true },
	{ id: "objects", title: "Objects", component: ObjectManagerPanel },
	{ id: "inspector", title: "Inspector", component: InspectorPanel },
	{ id: "workspace", title: "Workspace", component: WorkspacePanel },
];

/**
 * The map dockview needs: panel id -> React component. Derived from PANEL_TYPES
 * so there is a single source of truth for the available panels.
 */
export const PANEL_COMPONENTS: Record<
	string,
	FunctionComponent<IDockviewPanelProps>
> = Object.fromEntries(
	PANEL_TYPES.map(
		(panel): [string, FunctionComponent<IDockviewPanelProps>] => [
			panel.id,
			panel.component,
		]
	)
);
