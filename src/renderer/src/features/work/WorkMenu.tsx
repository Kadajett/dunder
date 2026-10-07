import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

export interface WorkMenuItem {
	readonly key: string;
	readonly label: ReactNode;
	/** Marks the current choice (a radio item). */
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly onSelect: () => void;
}

interface WorkMenuButtonProps {
	readonly className: string;
	/** The trigger's accessible name and tooltip. */
	readonly label: string;
	/** The menu's accessible name. */
	readonly menuLabel: string;
	readonly items: readonly WorkMenuItem[];
	readonly children: ReactNode;
}

const ITEMS = '[role^="menuitem"]:not(:disabled)';

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

function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, close: () => void): void {
	// Keys pressed in an open menu are the menu's: Esc must not also reach the room or edit mode.
	event.stopPropagation();
	if (event.key === "Escape" || event.key === "Tab") {
		event.preventDefault();
		close();
		return;
	}
	const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(ITEMS)];
	const focused = document.activeElement;
	const at = focused instanceof HTMLButtonElement ? items.indexOf(focused) : -1;
	const next = targetIndex(event.key, at, items.length);
	if (next === undefined) return;
	event.preventDefault();
	items[next]?.focus();
}

/** A chip that opens a small menu under it; the menu closes on a pick, an outside click, Esc or Tab. */
export function WorkMenuButton({
	className,
	label,
	menuLabel,
	items,
	children,
}: WorkMenuButtonProps) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLSpanElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const close = (): void => {
		setOpen(false);
		trigger.current?.focus();
	};
	useEffect(() => {
		if (!open) return;
		const current = menu.current;
		current?.scrollIntoView({ block: "nearest" });
		(
			current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
			current?.querySelector<HTMLElement>(ITEMS)
		)?.focus();
		const onPointerDown = (event: PointerEvent): void => {
			if (!(event.target instanceof Node && root.current?.contains(event.target))) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => document.removeEventListener("pointerdown", onPointerDown, true);
	}, [open]);
	return (
		<span ref={root} className="work-pop">
			<button
				ref={trigger}
				type="button"
				className={className}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={label}
				title={label}
				onClick={() => setOpen((value) => !value)}
			>
				{children}
			</button>
			{open ? (
				<div
					ref={menu}
					className="work-menu"
					role="menu"
					tabIndex={-1}
					aria-label={menuLabel}
					onKeyDown={(event) => onMenuKeyDown(event, close)}
				>
					{items.map((item) => (
						// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked is set only for menuitemradio items.
						<button
							key={item.key}
							type="button"
							role={item.checked === undefined ? "menuitem" : "menuitemradio"}
							aria-checked={item.checked}
							disabled={item.disabled}
							className="work-menu__item"
							onClick={() => {
								close();
								item.onSelect();
							}}
						>
							{item.label}
						</button>
					))}
				</div>
			) : null}
		</span>
	);
}
