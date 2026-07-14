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
import { Named } from "../../ecs/components/Named";
import { MaterialRef } from "../../ecs/components/MaterialRef";
import { assetRegistry } from "../../Assets/AssetRegistry";

/**
 * Lists the named entities in the ECS world. Clicking a row selects that entity
 * (which the Inspector then edits); the trash button destroys it. This is the
 * ECS analogue of a scene-object list - it queries the world for entities that
 * have a Named component.
 */
export function ObjectManagerPanel() {
	const app = useEditorStore();
	const entities = app.world.query(Named);

	const remove = (entity: number) => {
		// Every entity a material is minted for is owned by exactly one entity
		// (see AssetRegistry.createMaterial), so it's safe to dispose here
		// without checking whether another entity still references it.
		const materialRef = app.world.get(entity, MaterialRef);
		app.world.destroy(entity);
		if (materialRef) {
			assetRegistry.disposeMaterial(
				app.isAttached ? app.renderer : undefined,
				materialRef.material
			);
		}
		// destroy does not itself notify; clearing an equal selection emits,
		// otherwise emit explicitly so the list re-renders.
		if (app.selectedId === entity) {
			app.select(null);
		} else {
			app.notifyChanged();
		}
	};

	return (
		<Box
			sx={{
				height: "100%",
				overflow: "auto",
				bgcolor: "background.paper",
			}}
		>
			{entities.length === 0 ? (
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ p: 1.5 }}
				>
					No objects in the scene.
				</Typography>
			) : (
				<List dense disablePadding>
					{entities.map(([entity, named]) => (
						<ListItem
							key={entity}
							disablePadding
							secondaryAction={
								<IconButton
									edge="end"
									size="small"
									aria-label="remove"
									onClick={() => remove(entity)}
								>
									<DeleteOutlineIcon fontSize="small" />
								</IconButton>
							}
						>
							<ListItemButton
								selected={entity === app.selectedId}
								onClick={() => app.select(entity)}
							>
								<ListItemText
									primary={named.name || `Entity #${entity}`}
								/>
							</ListItemButton>
						</ListItem>
					))}
				</List>
			)}
		</Box>
	);
}
