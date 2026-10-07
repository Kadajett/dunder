import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { excalidrawAssets } from "./scripts/vite/excalidraw-assets";

const shared = { "@shared": resolve(__dirname, "src/shared") };

/**
 * `__OFFICE_BUILD__` in main: the commit a production build was made from
 * (stable mode compares it with HEAD to offer updates), or "dev" under the dev
 * server, where HMR already tracks the source.
 */
function buildIdentity(command: "build" | "serve"): string {
	if (command === "serve") return JSON.stringify("dev");
	let commit: string | null = null;
	try {
		commit = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: __dirname,
			encoding: "utf8",
			timeout: 5_000,
		}).trim();
	} catch {
		// Not a git checkout: the build runs, but cannot offer updates.
	}
	return JSON.stringify({ commit, builtAt: new Date().toISOString() });
}

export default defineConfig(({ command }) => ({
	main: {
		resolve: { alias: shared },
		define: { __OFFICE_BUILD__: buildIdentity(command) },
	},
	preload: { resolve: { alias: shared } },
	renderer: {
		resolve: { alias: { ...shared, "@renderer": resolve(__dirname, "src/renderer/src") } },
		// The whiteboard's fonts ship with the app (no CDN under the CSP, file:// in stable mode).
		plugins: [react(), excalidrawAssets(__dirname)],
	},
}));
