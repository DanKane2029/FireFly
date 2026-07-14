import { useState, MouseEvent } from "react";
import {
	AppBar,
	Toolbar,
	Typography,
	Button,
	Menu,
	MenuItem,
	Divider,
	Box,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { PANEL_TYPES, PanelType } from "./panels/registry";
import { useApp } from "./EngineContext";
import { RecentWorkspaceEntry } from "../platform/Storage";

/**
 * New/Open/Save/Save As, backed by App's Storage-driven scene methods. A
 * plain menu button, not a reactive one - the File menu doesn't display any
 * scene state itself (see App.currentFileName if that ever needs to change),
 * so there's nothing here that needs useEditorStore's re-renders.
 */
function FileMenu() {
	const app = useApp();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const runAndClose = (action: () => void | Promise<void>) => {
		setAnchor(null);
		// Save/Open can fail (e.g. a picked file isn't valid JSON, or an
		// AssetRegistry/format check in deserializeScene throws) - there's no
		// toast/notification system yet, so surface it the same blunt way an
		// uncaught render error would otherwise disappear silently.
		Promise.resolve(action()).catch((err) => {
			console.error(err);
			window.alert(err instanceof Error ? err.message : String(err));
		});
	};

	return (
		<>
			<Button
				size="small"
				onClick={(event: MouseEvent<HTMLElement>) =>
					setAnchor(event.currentTarget)
				}
				sx={{ color: "text.primary" }}
			>
				File
			</Button>
			<Menu
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
			>
				<MenuItem onClick={() => runAndClose(() => app.newScene())}>
					New
				</MenuItem>
				<MenuItem onClick={() => runAndClose(() => app.openScene())}>
					Open…
				</MenuItem>
				<MenuItem onClick={() => runAndClose(() => app.saveScene())}>
					{app.storageCapabilities.overwriteInPlace
						? "Save"
						: "Download"}
				</MenuItem>
				<MenuItem onClick={() => runAndClose(() => app.saveSceneAs())}>
					{app.storageCapabilities.overwriteInPlace
						? "Save As…"
						: "Download As…"}
				</MenuItem>
			</Menu>
		</>
	);
}

/**
 * Open a workspace (a folder imported asset bytes will be read from and
 * written to - see App.openWorkspace) and reopen a recent one. Nothing
 * consumes those bytes yet (that starts with the glTF import milestone),
 * so this is the workspace concept on its own: pick one, see it remembered
 * across a reload.
 */
function WorkspaceMenu() {
	const app = useApp();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [recents, setRecents] = useState<RecentWorkspaceEntry[]>([]);

	const openMenu = (event: MouseEvent<HTMLElement>) => {
		setAnchor(event.currentTarget);
		app.recentWorkspaces().then(setRecents);
	};

	const runAndClose = (action: () => void | Promise<void>) => {
		setAnchor(null);
		Promise.resolve(action()).catch((err) => {
			console.error(err);
			window.alert(err instanceof Error ? err.message : String(err));
		});
	};

	return (
		<>
			<Button
				size="small"
				onClick={openMenu}
				sx={{ color: "text.primary" }}
			>
				Workspace
			</Button>
			<Menu
				anchorEl={anchor}
				open={Boolean(anchor)}
				onClose={() => setAnchor(null)}
			>
				<MenuItem
					onClick={() => runAndClose(() => app.openWorkspace())}
				>
					{app.storageCapabilities.pickFolders
						? "Open Workspace…"
						: "Use Browser Storage"}
				</MenuItem>
				{recents.length > 0 && <Divider />}
				{recents.map((entry) => (
					<MenuItem
						key={entry.workspace.key}
						onClick={() =>
							runAndClose(() =>
								app.openRecentWorkspace(entry.workspace)
							)
						}
					>
						{entry.workspace.name}
					</MenuItem>
				))}
			</Menu>
		</>
	);
}

interface NavBarProps {
	/** Called when the user picks a panel type to add from the menu. */
	onAddPanel: (type: PanelType) => void;
}

/**
 * The slim top nav bar: the Firefly logo and name on the left, and an
 * "Add Panel" menu on the right that lets the user open any registered panel
 * type. The menu is built from the panel registry, so new panel types show up
 * here automatically.
 */
export function NavBar({ onAddPanel }: NavBarProps) {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const menuOpen = Boolean(anchor);

	return (
		<AppBar
			position="static"
			elevation={0}
			sx={{
				bgcolor: "background.paper",
				borderBottom: 1,
				borderColor: "divider",
			}}
		>
			<Toolbar
				variant="dense"
				disableGutters
				sx={{ minHeight: 40, px: 1.5, gap: 1 }}
			>
				{/* Logo placeholder - swap this Box for the real logo later. */}
				<Box
					sx={{
						width: 20,
						height: 20,
						borderRadius: "4px",
						bgcolor: "primary.main",
						flexShrink: 0,
					}}
				/>
				<Typography
					variant="subtitle2"
					sx={{
						fontWeight: 700,
						color: "text.primary",
						letterSpacing: 0.5,
					}}
				>
					Firefly
				</Typography>

				<FileMenu />
				<WorkspaceMenu />

				<Box sx={{ flex: 1 }} />

				<Button
					size="small"
					startIcon={<AddIcon />}
					onClick={(event: MouseEvent<HTMLElement>) =>
						setAnchor(event.currentTarget)
					}
					sx={{ color: "text.primary" }}
				>
					Add Panel
				</Button>
				<Menu
					anchorEl={anchor}
					open={menuOpen}
					onClose={() => setAnchor(null)}
				>
					{PANEL_TYPES.map((type) => (
						<MenuItem
							key={type.id}
							onClick={() => {
								onAddPanel(type);
								setAnchor(null);
							}}
						>
							{type.title}
						</MenuItem>
					))}
				</Menu>
			</Toolbar>
		</AppBar>
	);
}
