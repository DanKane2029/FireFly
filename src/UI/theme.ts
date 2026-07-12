import { createTheme } from "@mui/material/styles";

/**
 * The Firefly palette: a near-black "ink" backdrop, slightly lighter "surface"
 * panels, a muted mid tone for borders, off-white foreground text, and the
 * signature yellow-green "firefly glow" as the accent color.
 */
export const fireflyColors = {
	ink: "#05070A", // app background
	surface: "#0F131A", // panels / raised surfaces
	border: "#262C35", // borders and dividers
	muted: "#8B93A0", // secondary / muted text
	fg: "#F5F6F7", // primary foreground text
	glow: "#D9FF4D", // accent / primary
};

/**
 * The Material UI theme built from the Firefly palette. Dark mode, with the
 * glow as `primary` (using ink for its contrast text so labels stay legible on
 * the bright accent).
 */
export const fireflyTheme = createTheme({
	palette: {
		mode: "dark",
		primary: {
			main: fireflyColors.glow,
			contrastText: fireflyColors.ink,
		},
		background: {
			default: fireflyColors.ink,
			paper: fireflyColors.surface,
		},
		divider: fireflyColors.border,
		text: {
			primary: fireflyColors.fg,
			secondary: fireflyColors.muted,
		},
	},
	shape: {
		borderRadius: 6,
	},
	typography: {
		fontSize: 13,
	},
});
