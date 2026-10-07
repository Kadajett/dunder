import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { IPC } from "@shared/ipc";
import { type OpenResult, worktreeQuerySchema } from "@shared/worktrees";
import { app, ipcMain } from "electron";
import { z } from "zod";
import { runGit } from "../app-update/git";
import { WorktreeService } from "./service";

/**
 * Start the editor detached from Dunder. Electron's own variables are left
 * out: VS Code is an Electron app too and `ELECTRON_RUN_AS_NODE` would break it.
 */
function launch(program: string, args: readonly string[]): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith("ELECTRON_")),
	);
	const child = spawn(program, [...args], { detached: true, stdio: "ignore", env });
	child.once("spawn", () => {
		child.unref();
		resolve();
	});
	child.once("error", reject);
	return promise;
}

/** Where the editor command comes from: the current company's settings. */
export interface EditorSettings {
	current(): Promise<{ readonly editorCommand: string }>;
}

/** Worktrees of the app checkout, opened with the current company's editor command. */
export function createWorktrees(companies: EditorSettings): WorktreeService {
	return new WorktreeService({
		root: app.getAppPath(),
		git: runGit,
		changedAt: (path) =>
			stat(path).then(
				(info) => info.mtimeMs,
				() => 0,
			),
		editorCommand: async () => (await companies.current()).editorCommand,
		launch,
	});
}

const pathSchema = z.string().min(1).max(1024);

/** `window.office.worktrees` handlers. Renderer payloads are untrusted. */
export function registerWorktreesIpc(worktrees: WorktreeService): void {
	ipcMain.handle(IPC.worktreesFind, (_event, query: unknown) => {
		const parsed = worktreeQuerySchema.safeParse(query);
		return parsed.success ? worktrees.find(parsed.data).catch(() => null) : null;
	});
	ipcMain.handle(IPC.worktreesOpen, (_event, path: unknown): Promise<OpenResult> => {
		const parsed = pathSchema.safeParse(path);
		if (!parsed.success) return Promise.resolve({ ok: false, reason: "invalid folder" });
		return worktrees.open(parsed.data);
	});
}
