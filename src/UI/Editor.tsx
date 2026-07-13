import { useRef, useState } from "react";
import { Box } from "@mui/material";
import { DockviewReact } from "dockview-react";
import { DockviewApi, DockviewReadyEvent, themeAbyss } from "dockview";
import "dockview-core/dist/styles/dockview.css";
import "./firefly-dockview.css";
import { NavBar } from "./NavBar";
import { PANEL_COMPONENTS, PanelType } from "./panels/registry";

/**
 * The top-level editor: a slim nav bar over a dockview tiling layout. dockview
 * provides the docking mechanics for free - drag a tab to re-dock, drag a border
 * to resize, drop a panel onto another to form a tab group - and the nav bar's
 * "Add Panel" menu opens new panels at runtime.
 *
 * The default workspace places the Scene in the center with the Object manager
 * docked to its left and the Inspector to its right.
 */
export function Editor() {
	const [api, setApi] = useState<DockviewApi | null>(null);
	// Monotonic counter so repeatedly-added panels get unique ids.
	const nextInstance = useRef(0);

	const onReady = (event: DockviewReadyEvent) => {
		setApi(event.api);
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

	const addPanel = (type: PanelType) => {
		if (!api) {
			return;
		}

		// Singletons (e.g. the Scene view) reuse a fixed id: if one already
		// exists, focus it instead of opening a duplicate.
		if (type.singleton) {
			const existing = api.getPanel(type.id);
			if (existing) {
				existing.api.setActive();
				return;
			}
			api.addPanel({
				id: type.id,
				component: type.id,
				title: type.title,
			});
			return;
		}

		nextInstance.current += 1;
		api.addPanel({
			id: `${type.id}-${nextInstance.current}`,
			component: type.id,
			title: type.title,
		});
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<NavBar onAddPanel={addPanel} />
			<Box sx={{ flex: 1, minHeight: 0 }}>
				<DockviewReact
					components={PANEL_COMPONENTS}
					onReady={onReady}
					theme={themeAbyss}
				/>
			</Box>
		</Box>
	);
}
