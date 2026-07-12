import { FunctionComponent } from "react";
import { IDockviewPanelProps } from "dockview";
import { ScenePanel } from "./ScenePanel";
import { ObjectManagerPanel } from "./ObjectManagerPanel";
import { InspectorPanel } from "./InspectorPanel";

/**
 * Metadata describing one dockable panel type. `id` is both the dockview
 * component key and the panel id used when laying out the default workspace.
 */
export interface PanelType {
	id: string;
	title: string;
	component: FunctionComponent<IDockviewPanelProps>;
}

/**
 * The catalog of available panels. Adding a new panel is a one-line entry here
 * (plus its component); a future "add panel" menu can enumerate this list.
 */
export const PANEL_TYPES: PanelType[] = [
	{ id: "scene", title: "Scene", component: ScenePanel },
	{ id: "objects", title: "Objects", component: ObjectManagerPanel },
	{ id: "inspector", title: "Inspector", component: InspectorPanel },
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
