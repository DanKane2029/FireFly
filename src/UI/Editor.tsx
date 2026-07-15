import { useState } from "react";
import { Box } from "@mui/material";
import { DockviewReact } from "dockview-react";
import {
	DockviewApi,
	DockviewReadyEvent,
	SerializedDockview,
	themeAbyss,
} from "dockview";
import "dockview-core/dist/styles/dockview.css";
import "./firefly-dockview.css";
import { NavBar } from "./NavBar";
import { PANEL_COMPONENTS, PanelType } from "./panels/registry";

/** localStorage key the panel layout (which panels are open, their sizes and
 * positions) is persisted under, so it survives a reload - this is pure
 * client UI chrome, not scene data, so it doesn't go through the Storage
 * abstraction or a `.ffscene` file. */
const LAYOUT_STORAGE_KEY = "firefly.dockview-layout";

/** The layout new users (or a corrupted/incompatible saved layout - see
 * loadSavedLayout) start from: Scene centered, Objects docked left,
 * Inspector docked right. */
function buildDefaultLayout(api: DockviewApi): void {
	api.addPanel({
		id: "scene",
		component: "scene",
		title: "Scene",
	});
	api.addPanel({
		id: "objects",
		component: "objects",
		title: "Objects",
		position: { referencePanel: "scene", direction: "left" },
		initialWidth: 220,
	});
	api.addPanel({
		id: "inspector",
		component: "inspector",
		title: "Inspector",
		position: { referencePanel: "scene", direction: "right" },
		initialWidth: 260,
	});
}

/** Reads the saved layout, if any. Returns null (rather than throwing) for a
 * missing, corrupt, or inaccessible (private-browsing quota, etc.) value -
 * any of those just mean "start from the default layout instead". */
function loadSavedLayout(): SerializedDockview | null {
	try {
		const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as SerializedDockview) : null;
	} catch {
		return null;
	}
}

/**
 * The top-level editor: a slim nav bar over a dockview tiling layout. dockview
 * provides the docking mechanics for free - drag a tab to re-dock, drag a border
 * to resize, drop a panel onto another to form a tab group - and the nav bar's
 * "Add Panel" menu opens new panels at runtime.
 *
 * The layout persists across a reload (see LAYOUT_STORAGE_KEY): resize or
 * rearrange panels, reload, and they come back the way you left them. New
 * users (or a saved layout that fails to restore - e.g. after a panel type
 * is renamed or removed) get the default: Scene centered, Objects docked to
 * its left, Inspector to its right.
 */
export function Editor() {
	const [api, setApi] = useState<DockviewApi | null>(null);

	const onReady = (event: DockviewReadyEvent) => {
		setApi(event.api);

		const saved = loadSavedLayout();
		if (saved) {
			try {
				event.api.fromJSON(saved);
			} catch (err) {
				console.error(
					"Failed to restore the saved panel layout - falling back to the default.",
					err
				);
				buildDefaultLayout(event.api);
			}
		} else {
			buildDefaultLayout(event.api);
		}

		event.api.onDidLayoutChange(() => {
			try {
				localStorage.setItem(
					LAYOUT_STORAGE_KEY,
					JSON.stringify(event.api.toJSON())
				);
			} catch {
				// Losing layout persistence (quota, private browsing) is fine;
				// losing the app over it would not be.
			}
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

		// Find the lowest free "<id>-N" suffix by checking dockview's actual
		// current state, not a separately-tracked counter - a counter reset to
		// 0 on every mount would collide with instances a restored layout
		// already has open (e.g. "materials-1" surviving a reload), throwing
		// on the very next add of that panel type.
		let instance = 1;
		while (api.getPanel(`${type.id}-${instance}`)) {
			instance += 1;
		}
		api.addPanel({
			id: `${type.id}-${instance}`,
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
