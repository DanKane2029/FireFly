import { useState, MouseEvent } from "react";
import {
	AppBar,
	Toolbar,
	Typography,
	Button,
	Menu,
	MenuItem,
	Box,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { PANEL_TYPES, PanelType } from "./panels/registry";

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
					sx={{ fontWeight: 700, color: "text.primary", letterSpacing: 0.5 }}
				>
					Firefly
				</Typography>

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
