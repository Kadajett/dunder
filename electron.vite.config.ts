import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const shared = { "@shared": resolve(__dirname, "src/shared") };

/**
 * tldraw's license key for the renderer (see whiteboard/tldraw-license.ts):
 * `TLDRAW_LICENSE_KEY`, else `<XDG config>/dunder/tldraw-license-key`, else none.
 * Keys are public by design (validated in the browser), so baking one in is fine.
 */
function tldrawLicenseKey(): string {
	const fromEnv = process.env["TLDRAW_LICENSE_KEY"]?.trim();
	if (fromEnv) return fromEnv;
	const config = process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
	try {
		return readFileSync(join(config, "dunder", "tldraw-license-key"), "utf8").trim();
	} catch {
		return "";
	}
}

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
		plugins: [react()],
		define: { "import.meta.env.VITE_TLDRAW_LICENSE_KEY": JSON.stringify(tldrawLicenseKey()) },
		// Its `?url` asset imports only resolve through Vite itself, not the dev pre-bundler.
		optimizeDeps: { exclude: ["@tldraw/assets"] },
	},
}));
