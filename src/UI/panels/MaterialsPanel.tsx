import { ChangeEvent, KeyboardEvent, MouseEvent, useState } from "react";
import {
	Box,
	Button,
	IconButton,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	TextField,
	Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEditorStore } from "../EngineContext";
import { assetRegistry, MaterialDescriptor } from "../../Assets/AssetRegistry";
import { litProgram } from "../../ecs/prefabs";
import { MaterialPropertyType } from "../../Renderer/Material";
import { MaterialRef } from "../../ecs/components/MaterialRef";
import { AssetId } from "../../Assets/AssetId";
import { toHex } from "../colorHex";

/** The swatch color a material row shows, if it has an editable `u_color`. */
function swatchColor(descriptor: MaterialDescriptor): string | undefined {
	const prop = descriptor.properties.find(
		(p) => p.name === "u_color" && p.type === MaterialPropertyType.VEC4
	);
	return prop ? toHex(prop.value as ArrayLike<number>) : undefined;
}

/**
 * Lists every material in the AssetRegistry - not the scene's entities (see
 * ObjectManagerPanel for that). Materials are shared assets now (see
 * MaterialRef's doc comment): creating one here and assigning it to several
 * objects, then editing it from the Inspector, updates all of them at once.
 * Selecting a row here is independent of the scene's entity selection, so a
 * material can be edited (renamed, deleted if unused) without anything in
 * the viewport being selected.
 */
export function MaterialsPanel() {
	const app = useEditorStore();
	const materials = assetRegistry.listMaterials();
	const [editingId, setEditingId] = useState<AssetId | null>(null);
	const [editingText, setEditingText] = useState("");

	const createMaterial = () => {
		const id = assetRegistry.createMaterial("New Material", litProgram, [
			{ type: MaterialPropertyType.VEC4, name: "u_color", value: [1, 1, 1, 1] },
		]);
		app.selectMaterial(id);
		app.notifyChanged();
	};

	const remove = (id: AssetId) => {
		assetRegistry.disposeMaterial(
			app.isAttached ? app.renderer : undefined,
			id
		);
		if (app.selectedMaterialId === id) {
			app.selectMaterial(null);
		} else {
			app.notifyChanged();
		}
	};

	const commitRename = () => {
		if (editingId && editingText.trim()) {
			assetRegistry.renameMaterial(editingId, editingText.trim());
			app.notifyChanged();
		}
		setEditingId(null);
	};

	const selectedEntityMaterialRef =
		app.selectedId !== null
			? app.world.get(app.selectedId, MaterialRef)
			: undefined;
	const canAssign =
		app.selectedMaterialId !== null && selectedEntityMaterialRef !== undefined;

	return (
		<Box sx={{ height: "100%", overflow: "auto", bgcolor: "background.paper" }}>
			<Box sx={{ p: 1, display: "flex", justifyContent: "flex-end" }}>
				<Button size="small" startIcon={<AddIcon />} onClick={createMaterial}>
					New Material
				</Button>
			</Box>

			{materials.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ px: 1.5 }}>
					No materials yet.
				</Typography>
			) : (
				<List dense disablePadding>
					{materials.map(({ id, descriptor }) => {
						const usage = app.materialUsageCount(id);
						const color = swatchColor(descriptor);
						const isEditing = editingId === id;

						return (
							<ListItem
								key={id}
								disablePadding
								secondaryAction={
									<IconButton
										edge="end"
										size="small"
										aria-label="delete"
										disabled={usage > 0}
										title={
											usage > 0
												? "In use - unassign it from every object first."
												: "Delete"
										}
										onClick={() => remove(id)}
									>
										<DeleteOutlineIcon fontSize="small" />
									</IconButton>
								}
							>
								<ListItemButton
									selected={id === app.selectedMaterialId}
									onClick={() => app.selectMaterial(id)}
									onDoubleClick={() => {
										setEditingId(id);
										setEditingText(descriptor.name);
									}}
								>
									<ListItemIcon sx={{ minWidth: 32 }}>
										<Box
											sx={{
												width: 16,
												height: 16,
												borderRadius: "50%",
												border: 1,
												borderColor: "divider",
												bgcolor: color ?? "grey.500",
											}}
										/>
									</ListItemIcon>
									{isEditing ? (
										<TextField
											autoFocus
											size="small"
											variant="standard"
											value={editingText}
											onChange={(event: ChangeEvent<HTMLInputElement>) =>
												setEditingText(event.target.value)
											}
											onBlur={commitRename}
											onKeyDown={(event: KeyboardEvent) => {
												if (event.key === "Enter") {
													commitRename();
												}
											}}
											onClick={(event: MouseEvent) =>
												event.stopPropagation()
											}
										/>
									) : (
										<ListItemText
											primary={descriptor.name}
											secondary={
												usage > 0
													? `Used by ${usage} object${usage === 1 ? "" : "s"}`
													: "Unused"
											}
										/>
									)}
								</ListItemButton>
							</ListItem>
						);
					})}
				</List>
			)}

			{canAssign && (
				<Box sx={{ p: 1 }}>
					<Button
						size="small"
						variant="outlined"
						fullWidth
						onClick={() => {
							if (selectedEntityMaterialRef && app.selectedMaterialId) {
								selectedEntityMaterialRef.material = app.selectedMaterialId;
								app.notifyChanged();
							}
						}}
					>
						Assign to selected object
					</Button>
				</Box>
			)}
		</Box>
	);
}
