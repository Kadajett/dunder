/**
 * `npm run hud:shot [-- state …]`: the HUD screenshot harness. Screenshots the real App over a
 * stubbed `window.office` in headless Chrome, with no Electron and no workforce, one PNG plus a
 * rects/overlaps JSON per HUD state, into docs/screenshots/hud/. Exits 1 if a state never got
 * ready or showed a crash notice.
 *
 * The capture code runs through Vite's SSR loader so it can use the app's
 * `@shared` modules (the logger) the same way the app does.
 */
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { captureHud as CaptureHud } from "./hud-capture.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

const server = await createServer({ configFile: `${here}vite.config.ts` });
await server.listen();
try {
	const baseUrl = server.resolvedUrls?.local[0];
	if (!baseUrl) throw new Error("hud-shot: Vite did not report a local URL");
	const loaded = await server.ssrLoadModule(`${here}hud-capture.ts`);
	const captureHud: typeof CaptureHud = loaded["captureHud"];
	const ok = await captureHud(baseUrl, repo, process.argv.slice(2));
	if (!ok) process.exitCode = 1;
} finally {
	await server.close();
}
