import "./pool-label.css";
import { useSecondsLeft } from "../hud/countdown";
import { useFocus } from "../office/focus/focus-store";
import { usePool } from "./pool-store";

/**
 * Jeremy's shot while he is out of table view: how long until the engine
 * plays it for him, counting down, so it never happens behind his back.
 */
export function AutopilotNotice() {
	const at = usePool((state) => state.view?.jeremy.autopilotAt ?? null);
	const tableView = useFocus((state) => state.target?.kind === "table");
	const seconds = useSecondsLeft(at);
	if (at === null || tableView) return null;
	return (
		<div className="pool-autopilot" role="status">
			Your shot at the pool table: the engine plays it for you in {seconds}s. Click the table to
			take it.
		</div>
	);
}
