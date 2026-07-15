import { useEffect, useState } from "react";
import {
	Box,
	Button,
	IconButton,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Stack,
	Typography,
} from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useEditorStore } from "../EngineContext";
import { DirectoryEntry } from "../../platform/Storage";

// Imported assets are named "assets/<8-hex-char-content-hash>-<original name>"
// (see App.importModel / contentHash.ts) - strip that prefix so the panel
// shows "chair.glb" instead of "4b7e2a91-chair.glb".
const HASH_PREFIX = /^[0-9a-f]{8}-/;
function friendlyAssetName(fileName: string): string {
	return fileName.replace(HASH_PREFIX, "");
}

function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = -1;
	do {
		value /= 1024;
		unitIndex++;
	} while (value >= 1024 && unitIndex < units.length - 1);
	return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Browses the open workspace's files, one directory level at a time (not a
 * full expandable tree - "browse", not "manage": there's no delete/rename/
 * import here, since Storage doesn't have those methods and none were asked
 * for). Mirrors ObjectManagerPanel's list-panel shape, but its "rows" come
 * from App.listWorkspaceDirectory (a Storage.listDirectory pass-through)
 * instead of the ECS world.
 */
export function WorkspacePanel() {
	const app = useEditorStore();
	const [currentPath, setCurrentPath] = useState("");
	const [entries, setEntries] = useState<DirectoryEntry[]>([]);

	// A newly opened workspace starts back at its root - staying on a path
	// that belonged to the *previous* workspace would just show an empty
	// folder with no obvious way back except guessing "up" repeatedly.
	useEffect(() => {
		setCurrentPath("");
	}, [app.currentWorkspaceName]);

	useEffect(() => {
		let cancelled = false;
		app.listWorkspaceDirectory(currentPath).then((result) => {
			if (!cancelled) {
				setEntries(result);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [app, app.currentWorkspaceName, currentPath]);

	if (app.currentWorkspaceName === null) {
		return (
			<Box sx={{ p: 1.5 }}>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mb: 1 }}
				>
					No workspace open.
				</Typography>
				<Button
					size="small"
					variant="outlined"
					onClick={() => app.openWorkspace()}
				>
					Open Workspace…
				</Button>
			</Box>
		);
	}

	const segments = currentPath.split("/").filter(Boolean);
	const goUp = () => setCurrentPath(segments.slice(0, -1).join("/"));
	const goInto = (name: string) =>
		setCurrentPath(currentPath === "" ? name : `${currentPath}/${name}`);

	const sortedEntries = [...entries].sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === "directory" ? -1 : 1;
		}
		return a.name.localeCompare(b.name);
	});

	return (
		<Box
			sx={{
				height: "100%",
				overflow: "auto",
				bgcolor: "background.paper",
			}}
		>
			<Stack
				direction="row"
				alignItems="center"
				spacing={1}
				sx={{ px: 1.5, py: 1 }}
			>
				<IconButton
					size="small"
					aria-label="up"
					disabled={currentPath === ""}
					onClick={goUp}
				>
					<ArrowUpwardIcon fontSize="small" />
				</IconButton>
				<Typography variant="body2" color="text.secondary" noWrap>
					{app.currentWorkspaceName}
					{currentPath ? ` / ${currentPath}` : ""}
				</Typography>
			</Stack>
			{sortedEntries.length === 0 ? (
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ px: 1.5 }}
				>
					This folder is empty.
				</Typography>
			) : (
				<List dense disablePadding>
					{sortedEntries.map((entry) =>
						entry.kind === "directory" ? (
							<ListItem key={entry.name} disablePadding>
								<ListItemButton
									onClick={() => goInto(entry.name)}
								>
									<ListItemIcon sx={{ minWidth: 32 }}>
										<FolderIcon fontSize="small" />
									</ListItemIcon>
									<ListItemText primary={entry.name} />
								</ListItemButton>
							</ListItem>
						) : (
							<ListItem key={entry.name} sx={{ py: 0.5 }}>
								<ListItemIcon sx={{ minWidth: 32 }}>
									<InsertDriveFileIcon fontSize="small" />
								</ListItemIcon>
								<ListItemText
									primary={friendlyAssetName(entry.name)}
									secondary={
										entry.size !== undefined
											? formatSize(entry.size)
											: undefined
									}
								/>
							</ListItem>
						)
					)}
				</List>
			)}
		</Box>
	);
}
