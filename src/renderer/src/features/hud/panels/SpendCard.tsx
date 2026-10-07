import { SPEND_WINDOW_MINUTES } from "@shared/office-stats";
import { useState } from "react";
import { chiefAvailable, sendToChief } from "../../chief/chat-store";
import type { OfficeModel } from "../../office/model/office-model";
import { formatUsd, tellMaxText } from "../spend";
import type { TrustItem } from "../trust-inbox";
import { openAgentScreen } from "./open-agent";

type SpendItem = Extract<TrustItem, { kind: "spend" }>;

/** An agent spending past the company's alarm: who, how much, on what; open its terminal or ask Max to look. */
export function SpendCard({
	item,
	model,
}: {
	readonly item: SpendItem;
	readonly model: OfficeModel;
}) {
	const { agent, spender } = item;
	const seat = model.seated.find((seated) => seated.agent.paneId === agent.paneId);
	const [told, setTold] = useState<string | null>(null);
	const tell = (): void => {
		setTold("sending…");
		void sendToChief(tellMaxText(spender, SPEND_WINDOW_MINUTES)).then((result) =>
			setTold(result.state === "rejected" ? (result.reason ?? "Max couldn't take it") : "told Max"),
		);
	};
	return (
		<article className="hud-card" data-kind="spend">
			<div className="hud-card-head">
				<i className="status-dot status-blocked" />
				<strong>{agent.name}</strong>
				<span className="hud-card-meta">{formatUsd(spender.recentUsd)} / 30 min</span>
			</div>
			<p className="hud-card-line">
				spending fast: {formatUsd(spender.recentUsd)} on AI in the last {SPEND_WINDOW_MINUTES}{" "}
				minutes
			</p>
			{spender.bead ? (
				<p className="hud-card-quote">
					{spender.bead.id} · {spender.bead.title}
				</p>
			) : null}
			<div className="hud-card-actions">
				<button
					type="button"
					disabled={!seat}
					title={seat ? undefined : "This agent has no desk in the office layout"}
					onClick={() => seat && openAgentScreen(seat)}
				>
					Open terminal
				</button>
				<button
					type="button"
					className="secondary"
					disabled={!chiefAvailable || told === "sending…" || told === "told Max"}
					onClick={tell}
				>
					{told === "told Max" ? "Told Max" : "Tell Max"}
				</button>
			</div>
			{told && told !== "told Max" && told !== "sending…" ? (
				<p className="hud-card-line">{told}</p>
			) : null}
		</article>
	);
}
