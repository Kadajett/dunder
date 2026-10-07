import { createLogger } from "@shared/log/logger";
import type { WorkBoard } from "@shared/work-board";
import { runBd } from "../beads/bd";
import { postToMailbox } from "../switchboard/service";
import { gitIn, MergeChecks } from "./merges";
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
	// Through the switchboard, so it arrives like any office message, once the agent is free.
	const notify = (agent: string, text: string): void =>
		void postToMailbox(agent, text).catch((error: unknown) =>
			log.warn("agent not told", { agent, error }),
		);
	const merges = new MergeChecks(gitIn(cwd), notify);
	return new WorkBoardService({
		runBd,
		cwd,
		now: Date.now,
		setTimer: (callback, ms) => {
			const timer = setTimeout(callback, ms);
			return () => clearTimeout(timer);
		},
		emit,
		notify,
		spendOf: (agent, from, to) => spend.spendBetween(agent, from, to),
		checkMerges: (cards) => merges.annotate(cards),
	});
}
