import "./pool-label.css";
import { useEffect, useState } from "react";
import { useFocus } from "../office/focus/focus-store";
import { usePool } from "./pool-store";

/**
 * Jeremy's shot while he is out of table view: how long until the engine
 * plays it for him, counting down, so it never happens behind his back.
 */
export function AutopilotNotice() {
	const at = usePool((state) => state.view?.jeremy.autopilotAt ?? null);
	const tableView = useFocus((state) => state.target?.kind === "table");
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (at === null) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, [at]);
	if (at === null || tableView) return null;
	const seconds = Math.max(0, Math.ceil((at - now) / 1_000));
	return (
		<div className="pool-autopilot" role="status">
			Your shot at the pool table: the engine plays it for you in {seconds}s. Click the table to
			take it.
		</div>
	);
}
