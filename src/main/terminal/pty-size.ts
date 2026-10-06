import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { z } from "zod";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { PaneSize } from "./herdr-stream";
import type { ResolvePaneSize } from "./pane-size";

const processInfoSchema = z.object({
	result: z.object({ process_info: z.object({ shell_pid: z.number().int().positive() }) }),
});

const STTY_SIZE = /^(\d+) (\d+)\s*$/;

function sttySize(tty: string): Promise<PaneSize> {
	const { promise, resolve, reject } = Promise.withResolvers<PaneSize>();
	// `stty -F <tty> size` only queries the window size (TIOCGWINSZ); it changes nothing.
	execFile("stty", ["-F", tty, "size"], { timeout: 2_000 }, (error, stdout) => {
		const match = STTY_SIZE.exec(stdout);
		if (error || !match) reject(error ?? new Error(`unexpected stty output: ${stdout}`));
		else resolve({ rows: Number(match[1]), cols: Number(match[2]) });
	});
	return promise;
}

/**
 * The pane PTY's current size. herdr's layout rect is only what a herdr TUI
 * client would give the pane; whoever last controlled the pane (any `control`
 * client) may have resized the PTY to something else, and observing at the
 * wrong size crops or pads the screen. herdr does not report PTY columns, so
 * ask the kernel through the pane shell's terminal (Linux `/proc`), falling
 * back to the layout size (`home`, which also waits for the office server).
 */
export function createPtySizeResolver(home: ResolvePaneSize): ResolvePaneSize {
	return async (paneId) => {
		const fallback = await home(paneId);
		try {
			const args = officeArgs(["pane", "process-info", "--pane", paneId]);
			const { stdout } = await runHerdr(args, 3_000);
			const pid = processInfoSchema.parse(JSON.parse(stdout)).result.process_info.shell_pid;
			const tty = await readlink(`/proc/${pid}/fd/0`);
			if (!tty.startsWith("/dev/pts/")) return fallback;
			return await sttySize(tty);
		} catch {
			return fallback;
		}
	};
}
