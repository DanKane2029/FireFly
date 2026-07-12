import {
	Box,
	List,
	ListItem,
	ListItemButton,
	ListItemText,
	IconButton,
	Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEditorStore } from "../EngineContext";

/**
 * Lists the objects currently in the scene. Clicking a row selects that object
 * (which the Inspector then edits); the trash button removes it. Built from
 * Material UI list components so it inherits the Firefly theme, and kept
 * intentionally minimal as a template for richer object management later.
 */
export function ObjectManagerPanel() {
	const app = useEditorStore();
	const objects = app.scene.objectList;

	const remove = (id: number) => {
		app.scene.deleteObject(id);
		// deleteObject does not itself notify; clearing an equal selection emits,
		// otherwise emit explicitly so the list re-renders.
		if (app.selectedId === id) {
			app.select(null);
		} else {
			app.notifyChanged();
		}
	};

	return (
		<Box sx={{ height: "100%", overflow: "auto", bgcolor: "background.paper" }}>
			{objects.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
					No objects in the scene.
				</Typography>
			) : (
				<List dense disablePadding>
					{objects.map((obj) => (
						<ListItem
							key={obj.id}
							disablePadding
							secondaryAction={
								<IconButton
									edge="end"
									size="small"
									aria-label="remove"
									onClick={() => remove(obj.id)}
								>
									<DeleteOutlineIcon fontSize="small" />
								</IconButton>
							}
						>
							<ListItemButton
								selected={obj.id === app.selectedId}
								onClick={() => app.select(obj.id)}
							>
								<ListItemText
									primary={obj.name || `Object #${obj.id}`}
								/>
							</ListItemButton>
						</ListItem>
					))}
				</List>
			)}
		</Box>
	);
}
