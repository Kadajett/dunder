import type { WorkBoard } from "@shared/work-board";
import { runBd } from "../beads/bd";
import { WorkBoardService } from "./service";

/** The work board over the repo at `cwd`, reading and writing through the real `bd`. */
export function createWorkBoard(cwd: string, emit: (board: WorkBoard) => void): WorkBoardService {
	return new WorkBoardService({
		runBd,
		cwd,
		now: Date.now,
		setTimer: (callback, ms) => {
			const timer = setTimeout(callback, ms);
			return () => clearTimeout(timer);
		},
		emit,
	});
}
