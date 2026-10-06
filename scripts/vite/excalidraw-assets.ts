import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

/** URL folder (relative to the page) the renderer points `window.EXCALIDRAW_ASSET_PATH` at. */
export const EXCALIDRAW_ASSET_DIR = "excalidraw-assets";

/** Excalidraw's own font files (`fonts/<family>/…woff2`), as published. */
function fontsSource(root: string): string {
	return resolve(root, "node_modules/@excalidraw/excalidraw/dist/prod");
}

/**
 * Serve and ship Excalidraw's fonts from the app itself: the renderer's CSP
 * allows no CDN, and under file:// they must sit next to index.html. The build
 * copies `fonts/` into `<outDir>/excalidraw-assets/`; the dev server answers
 * `/excalidraw-assets/fonts/…` from node_modules.
 */
export function excalidrawAssets(root: string): Plugin {
	const source = fontsSource(root);
	let outDir = "";
	return {
		name: "dunder-excalidraw-assets",
		configResolved(config) {
			outDir = resolve(config.root, config.build.outDir);
		},
		writeBundle() {
			cpSync(join(source, "fonts"), join(outDir, EXCALIDRAW_ASSET_DIR, "fonts"), {
				recursive: true,
			});
		},
		configureServer(server) {
			server.middlewares.use(`/${EXCALIDRAW_ASSET_DIR}/`, (request, response, next) => {
				const file = normalize(
					join(source, decodeURIComponent((request.url ?? "").split("?")[0] ?? "")),
				);
				const inside = file.startsWith(join(source, "fonts"));
				if (!inside || !existsSync(file) || !statSync(file).isFile()) return next();
				response.setHeader(
					"Content-Type",
					file.endsWith(".woff2") ? "font/woff2" : "application/octet-stream",
				);
				createReadStream(file).pipe(response);
			});
		},
	};
}
