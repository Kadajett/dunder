import type { HudPanel } from "./view-store";

const STROKE = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

/** Small line icons for the nav pills, one per panel. */
export function PanelIcon({ panel }: { readonly panel: HudPanel }) {
	return (
		<svg className="hud-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
			{panel === "clients" ? (
				<>
					<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...STROKE} />
					<path d="M2.5 7h11M7 7v6.5" {...STROKE} />
				</>
			) : null}
			{panel === "inbox" ? (
				<>
					<rect x="2" y="3.5" width="12" height="9" rx="1.5" {...STROKE} />
					<path d="m2.5 4.5 5.5 4 5.5-4" {...STROKE} />
				</>
			) : null}
			{panel === "brain" ? (
				<>
					<rect x="2.5" y="2.5" width="11" height="11" rx="1" {...STROKE} />
					<path d="M5.5 2.5v11M8.5 5.5h3M8.5 8h3" {...STROKE} />
				</>
			) : null}
			{panel === "team" ? (
				<>
					<circle cx="8" cy="8" r="5.5" {...STROKE} />
					<path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
				</>
			) : null}
		</svg>
	);
}

/** The Trust Inbox glyph: a stack of lines on the blue button. */
export function InboxGlyph() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path d="M3.5 5h9M3.5 8h9M3.5 11h6" {...STROKE} strokeWidth={1.8} />
		</svg>
	);
}
