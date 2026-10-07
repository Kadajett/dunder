import { createLogger } from "@shared/log/logger";
import type { HumanAsk, WorkBoardApi, WorkResult } from "@shared/work-board";
import { useMemo } from "react";
import { useWork } from "./work-store";

const log = createLogger("work");

/** The open asks for Jeremy, minus the ones he just answered; empty while the board is unavailable. */
export function useHumanAsks(): readonly HumanAsk[] {
	const board = useWork((state) => state.board);
	const answering = useWork((state) => state.answering);
	return useMemo(
		() => (board?.state === "ok" ? board.asks.filter((ask) => !answering.includes(ask.id)) : []),
		[board, answering],
	);
}

/** Why the last answer to `id` failed, if it did. */
export function useAskError(id: string): string | undefined {
	return useWork((state) => state.errors[id]);
}

/** Hide the ask at once, run the write, and bring it back with the reason if bd refuses. */
async function settleAsk(
	id: string,
	verb: string,
	write: (api: WorkBoardApi) => Promise<WorkResult>,
) {
	if (!("work" in window.office)) return;
	const api = window.office.work;
	useWork.setState((state) => {
		const { [id]: _cleared, ...errors } = state.errors;
		return { answering: [...state.answering, id], errors };
	});
	const result: WorkResult = await write(api).catch((error: unknown) => ({
		ok: false as const,
		reason: error instanceof Error ? error.message : String(error),
	}));
	if (result.ok) return;
	log.warn("ask not settled", { id, verb, reason: result.reason });
	useWork.setState((state) => ({
		answering: state.answering.filter((answered) => answered !== id),
		errors: { ...state.errors, [id]: `Couldn't ${verb}: ${result.reason}` },
	}));
}

/** Answer an ask; main records it on the bead, closes it and tells the agent who asked. */
export function respondToAsk(id: string, response: string): Promise<void> {
	return settleAsk(id, "send the answer", (api) => api.respond(id, response));
}

/** Close an ask without an answer; the agent who asked is told. */
export function dismissAsk(id: string): Promise<void> {
	return settleAsk(id, "dismiss it", (api) => api.dismiss(id));
}
