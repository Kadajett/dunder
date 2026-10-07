import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { WhiteboardChange } from "@shared/whiteboard";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import { linesSince, REPLAY_MAX_AGE_MS } from "../switchboard/replay";
import { officeBoardDigestPath, officeBoardRequestsPath } from "./requests";
import { WhiteboardService } from "./service";

const log = createLogger("whiteboard");
const stateSchema = z.object({ offset: z.number().int().nonnegative() });

/** The saved offset, or null when it is missing or unreadable (the place is lost). */
async function savedOffset(statePath: string): Promise<number | null> {
	const text = await readFile(statePath, "utf8").catch(() => null);
	if (text === null) return null;
	try {
		return stateSchema.safeParse(JSON.parse(text)).data?.offset ?? null;
	} catch {
		return null;
	}
}

/** Requests made since `notBefore`, logging how many older ones a lost place skipped. */
function recentRequests(lines: readonly string[], notBefore: number): readonly string[] {
	const { fresh, skipped } = linesSince(lines, "requestedAt", notBefore);
	if (skipped > 0) log.info("skipped old board requests after losing the place", { skipped });
	return fresh;
}

export interface WhiteboardOptions {
	readonly userData: string;
	readonly currentCompanyId: () => Promise<string>;
	readonly chiefName: () => string | undefined;
	readonly emit: (change: WhiteboardChange) => void;
}

export interface Whiteboard {
	readonly service: WhiteboardService;
	/** Follow `office-board` requests from where the last run left off. */
	start(): Promise<void>;
	stop(): void;
}

/** The whiteboard wired to userData, the state dir and the `office-board` requests file. */
export function createWhiteboard(options: WhiteboardOptions): Whiteboard {
	const service = new WhiteboardService({
		dir: join(options.userData, "whiteboards"),
		digestPath: officeBoardDigestPath(process.env, homedir()),
		currentCompanyId: options.currentCompanyId,
		chiefName: options.chiefName,
		emit: options.emit,
	});
	const statePath = join(options.userData, "board-requests.json");
	let tail: MailboxTail | undefined;
	return {
		service,
		async start() {
			const saved = await savedOffset(statePath);
			// Lost place: read from the top, but only take the last hour's requests.
			const notBefore = saved === null ? Date.now() - REPLAY_MAX_AGE_MS : undefined;
			tail = await tailMailbox({
				path: officeBoardRequestsPath(process.env, homedir()),
				offset: saved ?? 0,
				onLines: (lines, next) => {
					writeFile(statePath, JSON.stringify({ offset: next })).catch((error: unknown) =>
						log.warn("cannot save the board requests offset", { error }),
					);
					service
						.receive(notBefore === undefined ? lines : recentRequests(lines, notBefore))
						.catch((error: unknown) => log.warn("board requests failed", { error }));
				},
				// A broken requests file only costs agents' notes; Jeremy's editor still works.
				onError: (error) => log.warn("cannot read board requests", { error }),
			});
		},
		stop() {
			tail?.stop();
		},
	};
}
