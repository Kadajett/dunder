import "./panels/panels.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import type { OfficeModel } from "../office/model/office-model";
import { setAlertsMuted, useAlerts } from "./alerts-store";
import { BrainPanel } from "./panels/BrainPanel";
import { ClientsPanel } from "./panels/ClientsPanel";
import { InboxPanel } from "./panels/InboxPanel";
import { TeamPanel } from "./panels/TeamPanel";
import { type HudPanel, useHud } from "./view-store";

/** Alerts on/off for needs-you notifications and the chime (Trust Inbox header). */
function AlertsBell() {
	const muted = useAlerts((state) => state.muted);
	if (muted === null) return null;
	return (
		<button
			type="button"
			className="hud-alerts-bell"
			aria-pressed={!muted}
			title={
				muted
					? "Alerts off: no desktop notification or chime when an agent needs you"
					: "Alerts on: a desktop notification and a chime when an agent is blocked or asks you, while Dunder is in the background"
			}
			onClick={() => setAlertsMuted(!muted)}
		>
			{muted ? "🔕 Alerts off" : "🔔 Alerts on"}
		</button>
	);
}

export interface HudPanelsProps {
	readonly model: OfficeModel;
	readonly snapshot: SessionSnapshot | null;
}

const HEADINGS: Record<HudPanel, { readonly title: string; readonly subtitle: string }> = {
	inbox: { title: "Trust Inbox", subtitle: "what needs you" },
	team: { title: "Team", subtitle: "everyone in the office" },
	brain: { title: "Brain", subtitle: "company memory · beads" },
	clients: { title: "Clients", subtitle: "rooms · herdr workspaces" },
};

function PanelBody({ panel, model, snapshot }: HudPanelsProps & { readonly panel: HudPanel }) {
	switch (panel) {
		case "inbox":
			return <InboxPanel model={model} snapshot={snapshot} />;
		case "team":
			return <TeamPanel model={model} />;
		case "brain":
			return <BrainPanel />;
		case "clients":
			return <ClientsPanel model={model} snapshot={snapshot} />;
	}
}

/** The side panel opened from the top bar (its inbox button or menu), sliding in on the right. */
export function HudPanels({ model, snapshot }: HudPanelsProps) {
	const panel = useHud((state) => state.panel);
	const closePanel = useHud((state) => state.closePanel);
	if (!panel) return null;
	const heading = HEADINGS[panel];
	return (
		<aside key={panel} className="hud-panel" aria-label={heading.title}>
			<header className="hud-panel-head">
				<div>
					<h2>{heading.title}</h2>
					<p>{heading.subtitle}</p>
				</div>
				{panel === "inbox" && <AlertsBell />}
				<button type="button" className="hud-panel-close" aria-label="Close" onClick={closePanel}>
					×
				</button>
			</header>
			<div className="hud-panel-body">
				<PanelBody panel={panel} model={model} snapshot={snapshot} />
			</div>
		</aside>
	);
}
