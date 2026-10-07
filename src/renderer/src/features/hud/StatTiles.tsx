import "./hud-stats.css";
import type { OfficeModel } from "../office/model/office-model";
import { useCostToday } from "./live-data";
import { costBreakdown, formatUsd } from "./spend";

/** Live figures: who is working, and what the office spent on AI today. */
export function StatTiles({ model }: { readonly model: OfficeModel }) {
	const cost = useCostToday();
	const working = model.agents.filter((agent) => agent.status === "working").length;
	return (
		<div className="hud-tiles">
			<div
				className="hud-chip hud-tile"
				title={`${working} of ${model.agents.length} agents working`}
			>
				<div className="hud-tile-value">
					<strong>{working}</strong>
					<code>working · {model.agents.length} total</code>
				</div>
				<small>Agents</small>
			</div>
			{cost.state === "ok" ? (
				<div className="hud-chip hud-tile" title={costBreakdown(cost)}>
					<div className="hud-tile-value">
						<strong>{formatUsd(cost.usd)}</strong>
					</div>
					<small>AI cost · today</small>
				</div>
			) : (
				<div className="hud-chip hud-tile" data-unavailable="true" title={cost.reason}>
					<div className="hud-tile-value">
						<strong>—</strong>
					</div>
					<small>AI cost · unavailable</small>
				</div>
			)}
		</div>
	);
}
