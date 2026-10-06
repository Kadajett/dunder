import type { MenuPanel } from "./hud-menu";

const STROKE = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

/** Small line icons for the menu's panel entries. */
export function PanelIcon({ panel }: { readonly panel: MenuPanel }) {
	return (
		<svg className="hud-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			{panel === "clients" ? (
				<>
					<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...STROKE} />
					<path d="M2.5 7h11M7 7v6.5" {...STROKE} />
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

/** The whiteboard: a board on an easel with a scribble. */
export function BoardGlyph() {
	return (
		<svg className="hud-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<rect x="2" y="2.5" width="12" height="8.5" rx="1" {...STROKE} />
			<path d="M5 13.5 6.5 11M11 13.5 9.5 11M4.5 8l2-2.5 2 2 2.5-3" {...STROKE} />
		</svg>
	);
}

/** The Trust Inbox: an envelope. */
export function InboxGlyph() {
	return (
		<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
			<rect x="2" y="3.5" width="12" height="9" rx="1.5" {...STROKE} />
			<path d="m2.5 4.5 5.5 4 5.5-4" {...STROKE} />
		</svg>
	);
}

/** The top-bar menu: three lines. */
export function MenuGlyph() {
	return (
		<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
			<path d="M3 4.5h10M3 8h10M3 11.5h10" {...STROKE} />
		</svg>
	);
}
