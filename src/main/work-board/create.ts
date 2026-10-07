import { createLogger } from "@shared/log/logger";
import type { WorkBoard } from "@shared/work-board";
import { runBd } from "../beads/bd";
import { postToMailbox } from "../switchboard/service";
import { WorkBoardService } from "./service";
import type { SpendOf } from "./spend";

const log = createLogger("work-board");

/** Where each card's approximate cost comes from (the office's cost tracker). */
export interface SpendSource {
	spendBetween: SpendOf;
}

/** The work board over the repo at `cwd`, reading and writing through the real `bd`; cards priced from `spend`. */
export function createWorkBoard(
	cwd: string,
	spend: SpendSource,
	emit: (board: WorkBoard) => void,
): WorkBoardService {
	return new WorkBoardService({
		runBd,
		cwd,
		now: Date.now,
		setTimer: (callback, ms) => {
			const timer = setTimeout(callback, ms);
			return () => clearTimeout(timer);
		},
		emit,
		// Through the switchboard, so it arrives like any office message, once the agent is free.
		notify: (agent, text) =>
			postToMailbox(agent, text).catch((error: unknown) =>
				log.warn("asker not told", { agent, error }),
			),
		spendOf: (agent, from, to) => spend.spendBetween(agent, from, to),
	});
}
