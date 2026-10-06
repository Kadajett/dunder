// office-run: run the production build of Dunder (`npm run office`) and keep
// it running. No dev server, no HMR, no watch: editing source never changes
// the running app. When the app installs an update it exits with
// RELAUNCH_EXIT_CODE and this supervisor starts it again on the new `out/`.
//   node src/cli/office-run.mts [extra electron args…]
// Runs under plain Node, so it uses only Node built-ins (no app imports).
import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Must match src/main/app-update/supervisor.ts; requests.test.ts keeps them in step. */
export const RELAUNCH_EXIT_CODE = 75;
export const SUPERVISED_ENV = "DUNDER_SUPERVISED";
/** This machine has no SUID sandbox helper configured, and runs under X11. */
const ELECTRON_ARGS = ["--no-sandbox", "--ozone-platform=x11"];

function launch(root: string, extra: readonly string[]): void {
	// The `electron` package's main export is the path to its binary.
	const electron = createRequire(import.meta.url)("electron") as string;
	const child: ChildProcess = spawn(electron, [".", ...ELECTRON_ARGS, ...extra], {
		cwd: root,
		stdio: "inherit",
		env: { ...process.env, [SUPERVISED_ENV]: "1" },
	});
	const forward = (signal: NodeJS.Signals): void => {
		child.kill(signal);
	};
	process.on("SIGINT", forward);
	process.on("SIGTERM", forward);
	child.on("exit", (code, signal) => {
		process.off("SIGINT", forward);
		process.off("SIGTERM", forward);
		if (code === RELAUNCH_EXIT_CODE) {
			process.stdout.write("office-run: relaunching Dunder on the new build\n");
			launch(root, extra);
			return;
		}
		process.exitCode = code ?? (signal ? 1 : 0);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	launch(join(dirname(fileURLToPath(import.meta.url)), "..", ".."), process.argv.slice(2));
}
