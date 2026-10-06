import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { WhiteboardChange } from "@shared/whiteboard";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import { officeBoardDigestPath, officeBoardRequestsPath } from "./requests";
import { WhiteboardService } from "./service";

const log = createLogger("whiteboard");
const stateSchema = z.object({ offset: z.number().int().nonnegative() });

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
			const offset = await readFile(statePath, "utf8").then(
				(text) => stateSchema.safeParse(JSON.parse(text)).data?.offset ?? 0,
				() => 0,
			);
			tail = await tailMailbox({
				path: officeBoardRequestsPath(process.env, homedir()),
				offset,
				onLines: (lines, next) => {
					void writeFile(statePath, JSON.stringify({ offset: next }));
					void service.receive(lines);
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
