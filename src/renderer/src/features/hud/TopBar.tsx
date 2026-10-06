import "./hud.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { EditButton } from "../edit/EditButton";
import type { OfficeModel } from "../office/model/office-model";
import { CompanySwitcher } from "./CompanySwitcher";
import { HudClock } from "./HudClock";
import { InboxGlyph, PanelIcon } from "./icons";
import { useTrustInbox } from "./inbox-store";
import { StatTiles } from "./StatTiles";
import { UpdatePill } from "./UpdatePill";
import { type HudPanel, useHud, type ViewMode } from "./view-store";

export interface TopBarProps {
	readonly model: OfficeModel;
	readonly snapshot: SessionSnapshot | null;
}

const NAV: readonly { readonly panel: HudPanel; readonly label: string }[] = [
	{ panel: "clients", label: "Clients" },
	{ panel: "inbox", label: "Inbox" },
	{ panel: "brain", label: "Brain" },
	{ panel: "team", label: "Team" },
];

const VIEWS: readonly { readonly view: ViewMode; readonly label: string }[] = [
	{ view: "classic", label: "Classic" },
	{ view: "office", label: "Office" },
];

function NavPills() {
	const panel = useHud((state) => state.panel);
	const togglePanel = useHud((state) => state.togglePanel);
	return (
		<nav className="hud-chip hud-nav">
			{NAV.map((item) => (
				<button
					key={item.panel}
					type="button"
					aria-pressed={panel === item.panel}
					title={item.label}
					onClick={() => togglePanel(item.panel)}
				>
					<PanelIcon panel={item.panel} />
					<span className="hud-nav-label">{item.label}</span>
				</button>
			))}
		</nav>
	);
}

function TrustInboxButton({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const count = useTrustInbox(snapshot).length;
	const open = useHud((state) => state.panel === "inbox");
	const togglePanel = useHud((state) => state.togglePanel);
	return (
		<button
			type="button"
			className="hud-trust"
			aria-pressed={open}
			title={`${count} item${count === 1 ? "" : "s"}: blocked agents and finished work not seen yet`}
			onClick={() => togglePanel("inbox")}
		>
			<span className="hud-trust-glyph">
				<InboxGlyph />
			</span>
			<span className="hud-trust-text">
				<strong>Trust Inbox</strong>
				<small>What needs you</small>
			</span>
			<span className="hud-trust-count" data-zero={count === 0}>
				{count}
			</span>
		</button>
	);
}

function ViewToggle() {
	const view = useHud((state) => state.view);
	const setView = useHud((state) => state.setView);
	return (
		<div className="hud-chip hud-toggle" role="radiogroup" aria-label="View">
			{VIEWS.map((item) => (
				<label key={item.view}>
					<input
						type="radio"
						name="hud-view"
						value={item.view}
						checked={view === item.view}
						onChange={() => setView(item.view)}
					/>
					{item.label}
				</label>
			))}
		</div>
	);
}

/** The HUD's top bar: company, nav, live stats, Trust Inbox, clock, edit and view toggles and the user. */
export function TopBar({ model, snapshot }: TopBarProps) {
	return (
		<header className="hud-topbar">
			<CompanySwitcher snapshot={snapshot} />
			<NavPills />
			<StatTiles model={model} />
			<span className="hud-spacer" />
			<UpdatePill />
			<TrustInboxButton snapshot={snapshot} />
			<HudClock />
			<EditButton />
			<ViewToggle />
			<span className="hud-avatar" title="Jeremy Stover">
				JS
			</span>
		</header>
	);
}
