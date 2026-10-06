/**
 * `npm run scene:shot`: screenshots the real office scene (default layout,
 * stubbed IPC) in headless Chrome, with no Electron and no workforce, and a
 * side-by-side against docs/reference/orpex-office.png.
 *
 * The capture code runs through Vite's SSR loader so it can use the app's
 * `@shared` modules (the logger) the same way the app does.
 */
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { captureAll as CaptureAll } from "./capture.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

const server = await createServer({ configFile: `${here}vite.config.ts` });
await server.listen();
try {
	const baseUrl = server.resolvedUrls?.local[0];
	if (!baseUrl) throw new Error("scene-shot: Vite did not report a local URL");
	const loaded = await server.ssrLoadModule(`${here}capture.ts`);
	const captureAll: typeof CaptureAll = loaded["captureAll"];
	await captureAll(baseUrl, repo);
} finally {
	await server.close();
}
