import type { UpdateStatus } from "@shared/app-update";
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useEdit } from "../edit/edit-store";
import { toggleEditMode } from "../edit/edit-toggle";
import { useWhiteboard } from "../whiteboard/whiteboard-store";
import { UpdateMenuSection } from "./HudUpdate";
import { type MenuAction, type MenuEntry, menuSections, updateBadge } from "./hud-menu";
import { BoardGlyph, MenuGlyph, PanelIcon } from "./icons";
import { useHud } from "./view-store";

const ITEMS = '[role^="menuitem"]:not(:disabled)';

function runAction(action: MenuAction): void {
	const hud = useHud.getState();
	switch (action.kind) {
		case "panel":
			hud.togglePanel(action.panel);
			return;
		case "view":
			hud.setView(action.view);
			return;
		case "edit":
			toggleEditMode();
			return;
		case "whiteboard":
			useWhiteboard.getState().setOpen(true);
			return;
	}
}

/** Where an arrow, Home or End key moves focus among `count` items from `at` (-1: none focused). */
function targetIndex(key: string, at: number, count: number): number | undefined {
	switch (key) {
		case "ArrowDown":
			return (at + 1) % count;
		case "ArrowUp":
			return (at <= 0 ? count : at) - 1;
		case "Home":
			return 0;
		case "End":
			return count - 1;
		default:
			return undefined;
	}
}

function MenuItem({
	entry,
	onRun,
}: {
	readonly entry: MenuEntry;
	readonly onRun: (action: MenuAction) => void;
}) {
	const { action } = entry;
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is set only for the menuitemcheckbox and menuitemradio roles.
		<button
			type="button"
			role={entry.role}
			aria-checked={entry.role === "menuitem" ? undefined : entry.checked === true}
			disabled={entry.disabled === true}
			className="hud-menu-action hud-menu-entry"
			onClick={() => onRun(action)}
		>
			{action.kind === "panel" ? <PanelIcon panel={action.panel} /> : null}
			{action.kind === "whiteboard" ? <BoardGlyph /> : null}
			<span>{entry.label}</span>
			{entry.hint ? <small>{entry.hint}</small> : null}
			{entry.checked ? <span className="hud-check">✓</span> : null}
		</button>
	);
}

interface MenuPopupProps {
	readonly update: UpdateStatus;
	/** Close the menu and return focus to its button. */
	readonly onClose: () => void;
}

function MenuPopup({ update, onClose }: MenuPopupProps) {
	const panel = useHud((state) => state.panel);
	const view = useHud((state) => state.view);
	const editing = useEdit((state) => state.editing);
	const editReady = useEdit((state) => state.base !== null);
	const menu = useRef<HTMLDivElement>(null);
	useEffect(() => {
		menu.current?.querySelector<HTMLElement>(ITEMS)?.focus();
	}, []);
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
		// Keys pressed in the open menu are the menu's: Esc must not also deselect an edit-mode item, nor R rotate it.
		event.stopPropagation();
		if (event.key === "Escape" || event.key === "Tab") {
			event.preventDefault();
			onClose();
			return;
		}
		const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(ITEMS)];
		const focused = document.activeElement;
		const at = focused instanceof HTMLButtonElement ? items.indexOf(focused) : -1;
		const next = targetIndex(event.key, at, items.length);
		if (next === undefined) return;
		event.preventDefault();
		items[next]?.focus();
	};
	const run = (action: MenuAction): void => {
		onClose();
		runAction(action);
	};

	return (
		<>
			<button
				type="button"
				className="hud-menu-backdrop"
				aria-label="Close menu"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				ref={menu}
				className="hud-menu hud-menu-right"
				role="menu"
				// Focusable so a click on the menu's text keeps focus inside it, and Esc still closes it.
				tabIndex={-1}
				aria-label="Office"
				onKeyDown={onKeyDown}
			>
				{menuSections({ panel, view, editing, editReady }).map((section) => (
					<Fragment key={section.heading}>
						<p className="hud-menu-heading">{section.heading}</p>
						{section.entries.map((entry) => (
							<MenuItem key={entry.label} entry={entry} onRun={run} />
						))}
					</Fragment>
				))}
				<UpdateMenuSection status={update} onDone={onClose} />
			</div>
		</>
	);
}

/**
 * The top bar's one menu: the Clients, Brain and Team panels, Office/Classic,
 * layout editing and app updates. A dot on its icon flags a pending update.
 */
export function HudMenu({ update }: { readonly update: UpdateStatus }) {
	const [open, setOpen] = useState(false);
	const button = useRef<HTMLButtonElement>(null);
	const badge = updateBadge(update);
	const close = (): void => {
		setOpen(false);
		button.current?.focus();
	};
	return (
		<div className="hud-more">
			<button
				ref={button}
				type="button"
				className="hud-chip hud-icon-button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={badge ? `Menu (update ${badge})` : "Menu"}
				title="Menu"
				onClick={() => setOpen((value) => !value)}
			>
				<MenuGlyph />
				{badge ? <span className="hud-menu-badge" data-state={badge} /> : null}
			</button>
			{open ? <MenuPopup update={update} onClose={close} /> : null}
		</div>
	);
}
