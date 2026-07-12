import { DockviewReact } from "dockview-react";
import { DockviewReadyEvent, themeAbyss } from "dockview";
import "dockview-core/dist/styles/dockview.css";
import "./firefly-dockview.css";
import { PANEL_COMPONENTS } from "./panels/registry";

/**
 * The top-level editor: a dockview tiling layout that hosts the panels. dockview
 * provides the docking mechanics for free - drag a tab to re-dock it, drag a
 * border to resize, drop a panel onto another to form a tab group.
 *
 * The default workspace places the Scene in the center with the Object manager
 * docked to its left and the Inspector to its right.
 */
export function Editor() {
	const onReady = (event: DockviewReadyEvent) => {
		event.api.addPanel({
			id: "scene",
			component: "scene",
			title: "Scene",
		});
		event.api.addPanel({
			id: "objects",
			component: "objects",
			title: "Objects",
			position: { referencePanel: "scene", direction: "left" },
			initialWidth: 220,
		});
		event.api.addPanel({
			id: "inspector",
			component: "inspector",
			title: "Inspector",
			position: { referencePanel: "scene", direction: "right" },
			initialWidth: 260,
		});
	};

	return (
		<DockviewReact
			components={PANEL_COMPONENTS}
			onReady={onReady}
			theme={themeAbyss}
		/>
	);
}
