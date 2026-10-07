import type { UpdateStatus } from "@shared/app-update";
import type { HudPanel, ViewMode } from "./view-store";

/** What the top-bar menu reflects: open panel, view, the layout editor and a running brainstorm. */
export interface MenuState {
	readonly panel: HudPanel | null;
	readonly view: ViewMode;
	readonly editing: boolean;
	/** The editor has a saved layout to start from; until then it can't open. */
	readonly editReady: boolean;
	readonly brainstorming: boolean;
	/** The master Sounds switch (chimes, Max's voice on a call). */
	readonly sounds: boolean;
}

/** Panels reached through the menu; the Trust Inbox has its own button in the bar. */
export type MenuPanel = Exclude<HudPanel, "inbox">;

export type MenuAction =
	| { readonly kind: "panel"; readonly panel: MenuPanel }
	| { readonly kind: "view"; readonly view: ViewMode }
	| { readonly kind: "edit" }
	| { readonly kind: "whiteboard" }
	/** Open the topic dialog, or end the running brainstorm. */
	| { readonly kind: "brainstorm" }
	/** Turn every app sound on or off. */
	| { readonly kind: "sounds" }
	/** Open the window's devtools (its keyboard shortcut is taken by the office). */
	| { readonly kind: "devtools" };

export interface MenuEntry {
	readonly label: string;
	readonly role: "menuitem" | "menuitemcheckbox" | "menuitemradio";
	/** Checkbox and radio entries only. */
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly hint?: string;
	readonly action: MenuAction;
}

export interface MenuSection {
	readonly heading: string;
	readonly entries: readonly MenuEntry[];
}

const PANELS: readonly { readonly panel: MenuPanel; readonly label: string }[] = [
	{ panel: "clients", label: "Clients" },
	{ panel: "brain", label: "Brain" },
	{ panel: "team", label: "Team" },
];

const VIEWS: readonly { readonly view: ViewMode; readonly label: string }[] = [
	{ view: "office", label: "Office" },
	{ view: "classic", label: "Classic" },
];

function editEntry(state: MenuState): MenuEntry {
	const action = { kind: "edit" } as const;
	if (state.editing) {
		return { label: "Exit edit", role: "menuitem", hint: "discards unsaved changes", action };
	}
	if (!state.editReady) {
		return { label: "Edit layout", role: "menuitem", disabled: true, hint: "loading…", action };
	}
	return { label: "Edit layout", role: "menuitem", action };
}

/** The menu's entries for the current state, grouped as shown. */
export function menuSections(state: MenuState): readonly MenuSection[] {
	return [
		{
			heading: "Panels",
			entries: [
				...PANELS.map(
					({ panel, label }): MenuEntry => ({
						label,
						role: "menuitemcheckbox",
						checked: state.panel === panel,
						action: { kind: "panel", panel },
					}),
				),
				{ label: "Whiteboard", role: "menuitem", action: { kind: "whiteboard" } },
				{
					label: state.brainstorming ? "End brainstorm" : "Start brainstorm…",
					role: "menuitem",
					action: { kind: "brainstorm" },
				},
			],
		},
		{
			heading: "View",
			entries: VIEWS.map(({ view, label }) => ({
				label,
				role: "menuitemradio",
				checked: state.view === view,
				action: { kind: "view", view },
			})),
		},
		{ heading: "Layout", entries: [editEntry(state)] },
		{
			heading: "Sound",
			entries: [
				{
					label: "Sounds",
					role: "menuitemcheckbox",
					checked: state.sounds,
					hint: state.sounds ? "chimes, Max's voice" : "off: Max in captions",
					action: { kind: "sounds" },
				},
			],
		},
		{
			heading: "Help",
			entries: [
				{
					label: "Open devtools",
					role: "menuitem",
					hint: "Ctrl+Shift+I",
					action: { kind: "devtools" },
				},
			],
		},
	];
}

/** The dot on the menu icon: an update to apply, building, or failed; none otherwise (nor for the build Jeremy rolled back from). */
export function updateBadge(status: UpdateStatus): "available" | "building" | "failed" | null {
	switch (status.state) {
		case "dev":
		case "idle":
			return null;
		case "available":
			return status.rolledBack ? null : "available";
		default:
			return status.state;
	}
}
