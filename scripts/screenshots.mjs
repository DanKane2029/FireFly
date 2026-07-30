#!/usr/bin/env node
/**
 * Captures the README screenshots from the running editor.
 *
 * These are real screenshots of the real UI, regenerated rather than hand-made,
 * so they cannot drift into showing something the app does not actually do.
 *
 * Playwright is not a project dependency — it is only needed to refresh these
 * images, which is rare. Install it on demand:
 *
 *   npm i --no-save playwright-core
 *
 * Then, in one terminal:      npm run start:dev
 * and in another:             node scripts/screenshots.mjs
 *
 * The renderer needs a real WebGL2 context, which headless Chromium only has
 * via SwiftShader — hence the ANGLE flags below. It is a software rasterizer,
 * so frames take a beat longer to land than they would on a GPU; that is what
 * `settle()` is waiting for.
 */

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const OUT_DIR = fileURLToPath(new URL("../docs/screenshots", import.meta.url));

/**
 * Chromium binary. Playwright's own cache is the default; override with
 * CHROMIUM_PATH if yours lives elsewhere.
 */
const BROWSER =
	process.env.CHROMIUM_PATH ??
	`${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;

/**
 * SwiftShader is a software GL implementation. Without these, headless
 * Chromium has no WebGL2 context at all and the canvas stays blank.
 */
const GL_ARGS = [
	"--use-gl=angle",
	"--use-angle=swiftshader",
	"--enable-unsafe-swiftshader",
	"--enable-webgl",
	"--ignore-gpu-blocklist",
];

const VIEWPORT = { width: 1600, height: 1000 };

/** Lets the render loop draw a few frames before the shutter. */
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

async function main() {
	await mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch({
		executablePath: BROWSER,
		args: GL_ARGS,
	});
	const page = await browser.newPage({ viewport: VIEWPORT });

	const failures = [];
	page.on("pageerror", (error) => failures.push(error.message));

	await page.goto(BASE_URL, { waitUntil: "networkidle" });
	await page.locator("canvas").first().waitFor({ state: "visible" });
	await settle(page, 3000);

	// Bail rather than ship a screenshot of a blank canvas: if the context
	// failed to come up, every image below would be a picture of nothing.
	const hasGL = await page.evaluate(
		() => !!document.querySelector("canvas")?.getContext("webgl2")
	);
	if (!hasGL && failures.length > 0) {
		throw new Error(`Page errors before capture:\n${failures.join("\n")}`);
	}

	// Whatever App's constructor loads as the starting document — currently the
	// snowman, which is useful here for having nine separately named entities
	// to show in the Objects panel.
	const canvas = page.locator("canvas").first();
	const box = await canvas.boundingBox();
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;

	// Frame the shot. The default camera leaves the model small and dead-on,
	// which flattens it and hides the gizmo's Z axis behind its own origin —
	// orbiting to a three-quarter view separates all three handles.
	await page.mouse.move(cx, cy);
	await page.mouse.down({ button: "right" });
	await page.mouse.move(cx - 110, cy - 90, { steps: 20 });
	await page.mouse.up({ button: "right" });
	await settle(page, 600);

	await page.mouse.wheel(0, 60);
	await settle(page);

	// Select the head rather than a body ball: it sits high enough that the
	// gizmo's handles fall against the empty background instead of being
	// swallowed by the geometry behind them — and the green Y arrow is
	// invisible against the green middle snowball.
	await page.mouse.click(cx, cy - 130);
	await settle(page);

	await page.screenshot({ path: `${OUT_DIR}/editor.png` });

	await browser.close();

	if (failures.length > 0) {
		console.warn(`Captured, but the page logged errors:\n${failures.join("\n")}`);
	}
	console.log(`Wrote editor.png to ${OUT_DIR}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
