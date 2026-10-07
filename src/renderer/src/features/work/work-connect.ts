import { createLogger } from "@shared/log/logger";
import { useWork, workApi } from "./work-store";

const log = createLogger("work");

/** Follow main's board (once per window); returns the cleanup. */
export function connectWork(): () => void {
	const api = workApi();
	const { receive } = useWork.getState();
	if (!api) {
		receive({ state: "unavailable", reason: "This build has no work board." });
		return () => undefined;
	}
	// A push that beats the first read is fresher; the read must not overwrite it.
	let pushed = false;
	let live = true;
	const off = api.onChanged((board) => {
		pushed = true;
		receive(board);
	});
	api.get().then(
		(board) => {
			if (live && !pushed) receive(board);
		},
		(error: unknown) => {
			log.warn("work board read failed", error instanceof Error ? error : { error: String(error) });
			if (live && !pushed) receive({ state: "unavailable", reason: "Couldn't read the board." });
		},
	);
	return () => {
		live = false;
		off();
	};
}
