import { join } from "node:path";
import { IPC } from "@shared/ipc";
import { createLogger } from "@shared/log/logger";
import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import { runGit } from "../app-update/git";
import { builtCommit } from "../app-update/relaunch";
import { AwayService } from "./service";

const log = createLogger("away");

/** While he is at the window, idle time is checked this often. */
const CHECK_MS = 60_000;

/** What the summary is made of: the board's closed beads and asks, and the office's spend. */
export interface AwaySources {
	readonly workBoard: {
		closedSince(since: number): Promise<readonly { readonly id: string; readonly title: string }[]>;
		get(): Promise<{ readonly state: string; readonly asks?: readonly unknown[] }>;
	};
	readonly aiCost: { totalBetween(from: number, to: number): number | null };
}

/** Commits the running build is ahead of the one running when he left. */
async function updatesSince(from: string | null, to: string | null): Promise<number> {
	if (!from || !to || from === to) return 0;
	const count = await runGit(app.getAppPath(), ["rev-list", "--count", `${from}..${to}`]).catch(
		() => "0",
	);
	return Number.parseInt(count.trim(), 10) || 0;
}

/**
 * The "While you were away" summary, following the window's focus and the
 * machine's idle time; it pushes a summary to the window when he is back.
 */
export function createAway({ workBoard, aiCost }: AwaySources): AwayService {
	const build = builtCommit() ?? null;
	const away = new AwayService({
		statePath: join(app.getPath("userData"), "away.json"),
		now: Date.now,
		focused: () => BrowserWindow.getAllWindows().some((window) => window.isFocused()),
		idleMs: () => powerMonitor.getSystemIdleTime() * 1000,
		build,
		facts: async (awayAt, now, fromBuild) => {
			const board = await workBoard.get();
			return {
				closed: await workBoard.closedSince(awayAt),
				asks: board.state === "ok" ? (board.asks?.length ?? 0) : 0,
				updates: await updatesSince(fromBuild, build),
				spendUsd: aiCost.totalBetween(awayAt, now),
			};
		},
		emit: (summary) => {
			for (const window of BrowserWindow.getAllWindows())
				window.webContents.send(IPC.awaySummary, summary);
		},
	});
	const check = () => void away.check();
	app.on("browser-window-blur", check);
	app.on("browser-window-focus", check);
	setInterval(check, CHECK_MS).unref();
	log.info("following focus and idle time for the away summary");
	return away;
}

/** `window.office.away` handlers. */
export function registerAwayIpc(away: AwayService): void {
	ipcMain.handle(IPC.awayGet, () => away.get());
	ipcMain.handle(IPC.awayDismiss, () => away.dismiss());
}
