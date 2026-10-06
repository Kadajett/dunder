import "./cards.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import type { Layout } from "@shared/layout/schema";
import { StaffActions } from "../../hire/StaffActions";
import { openScreen } from "../focus/open-screen";
import type { OfficeModel, SeatedAgent } from "../model/office-model";
import { ModelPicker } from "../models/ModelPicker";
import { MailroomCard } from "./MailroomCard";
import { useSelection } from "./selection-store";

const STATUS_LABEL = {
	working: "working",
	idle: "idle",
	done: "done — not seen yet",
	blocked: "blocked — needs you",
	unknown: "unknown",
} as const;

function Row({ label, value }: { readonly label: string; readonly value: string | undefined }) {
	if (!value) return null;
	return (
		<div className="card-row">
			<span>{label}</span>
			<code>{value}</code>
		</div>
	);
}

function AgentCard({ seat, close }: { readonly seat: SeatedAgent; readonly close: () => void }) {
	const { agent } = seat;
	return (
		<aside className="world-card">
			<header>
				<i className={`status-dot status-${agent.status}`} />
				<strong>{agent.name.toUpperCase()}</strong>
				<button type="button" className="card-close" onClick={close} aria-label="Close">
					×
				</button>
			</header>
			<p className="card-status">{STATUS_LABEL[agent.status]}</p>
			<Row label="harness" value={agent.kind} />
			<Row label="room" value={agent.workspaceLabel ? `#${agent.workspaceLabel}` : undefined} />
			<Row label="desk" value={seat.desk.id} />
			<Row label="pane" value={agent.paneId} />
			<ModelPicker agentName={agent.name} />
			<button
				type="button"
				className="card-action card-action-secondary"
				onClick={() => {
					close();
					openScreen(seat);
				}}
			>
				Open screen
			</button>
			<StaffActions name={agent.name} onFired={close} />
		</aside>
	);
}

function SessionCard(props: {
	readonly snapshot: SessionSnapshot | null;
	readonly close: () => void;
}) {
	const { snapshot } = props;
	const working = snapshot?.agents.filter((agent) => agent.agent_status === "working").length ?? 0;
	return (
		<aside className="world-card">
			<header>
				<i className={`status-dot status-${snapshot ? "working" : "unknown"}`} />
				<strong>ACCESS · HERDR SERVER</strong>
				<button type="button" className="card-close" onClick={props.close} aria-label="Close">
					×
				</button>
			</header>
			<p className="card-status">{snapshot ? "office session online" : "connecting…"}</p>
			<Row label="session" value="office" />
			<Row
				label="herdr"
				value={snapshot ? `${snapshot.version} · protocol ${snapshot.protocol}` : undefined}
			/>
			<Row label="rooms" value={snapshot ? String(snapshot.workspaces.length) : undefined} />
			<Row label="panes" value={snapshot ? String(snapshot.panes.length) : undefined} />
			<Row
				label="agents"
				value={snapshot ? `${snapshot.agents.length} · ${working} working` : undefined}
			/>
		</aside>
	);
}

/** The card for whatever is selected in the world. */
export function WorldCards(props: {
	readonly model: OfficeModel;
	readonly layout: Layout;
	readonly snapshot: SessionSnapshot | null;
}) {
	const selection = useSelection((state) => state.selection);
	const clear = useSelection((state) => state.clear);
	if (selection?.kind === "agent") {
		const seat = props.model.seated.find((seated) => seated.agent.paneId === selection.paneId);
		return seat ? <AgentCard seat={seat} close={clear} /> : null;
	}
	if (selection?.kind === "decor") {
		const item = props.layout.decor.find((decor) => decor.id === selection.id);
		if (item?.kind === "server-rack")
			return <SessionCard snapshot={props.snapshot} close={clear} />;
		if (item?.kind === "mail-cubby") return <MailroomCard close={clear} />;
	}
	return null;
}
