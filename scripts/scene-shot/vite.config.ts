import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { excalidrawAssets } from "../vite/excalidraw-assets";

const repo = resolve(__dirname, "../..");

/** Serves the scene-shot pages (renderer code, stubbed IPC) for `npm run scene:shot`. */
export default defineConfig({
	root: resolve(__dirname, "page"),
	plugins: [react({ exclude: [/\/node_modules\//, /\/\.vite\//] }), excalidrawAssets(repo)],
	resolve: {
		alias: {
			"@shared": resolve(repo, "src/shared"),
			"@renderer": resolve(repo, "src/renderer/src"),
		},
	},
	// Found only behind the wall board's lazy import otherwise: Vite would re-optimize and reload mid-run.
	optimizeDeps: { include: ["@excalidraw/excalidraw"] },
	// node_modules may be a symlink (git worktrees share one); its real path must be servable too.
	server: {
		host: "127.0.0.1",
		port: 0,
		fs: { allow: [repo, realpathSync(resolve(repo, "node_modules"))] },
	},
	// Keep the pre-bundle cache out of node_modules, which worktrees share with the main checkout
	// (plugin-react must then be told not to run Babel over it).
	cacheDir: resolve(repo, ".vite/scene-shot"),
	logLevel: "warn",
});
