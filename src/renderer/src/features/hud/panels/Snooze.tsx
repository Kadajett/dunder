import "./snooze.css";
import type { SnoozeChoice } from "@shared/inbox-snooze";
import { useState } from "react";
import { snoozeItem, unsnoozeItem } from "../snooze-store";
import { type SnoozedItem, snoozeKeyOf, type TrustItem } from "../trust-inbox";

const CHOICES: readonly { readonly choice: SnoozeChoice; readonly label: string }[] = [
	{ choice: "1h", label: "1 hour" },
	{ choice: "4h", label: "4 hours" },
	{ choice: "morning", label: "Until tomorrow 9:00" },
];

/** 'Snooze ▾' on an ask or blocked card: it leaves the inbox (and its alerts) until then. */
export function SnoozeMenu({ snoozeKey }: { readonly snoozeKey: string }) {
	const [open, setOpen] = useState(false);
	return (
		<span className="snooze-menu">
			<button
				type="button"
				className="secondary"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				Snooze ▾
			</button>
			{open ? (
				<span className="snooze-options" role="menu">
					{CHOICES.map(({ choice, label }) => (
						<button
							key={choice}
							type="button"
							role="menuitem"
							onClick={() => {
								setOpen(false);
								snoozeItem(snoozeKey, choice);
							}}
						>
							{label}
						</button>
					))}
				</span>
			) : null}
		</span>
	);
}

const clock = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	hour: "numeric",
	minute: "2-digit",
});

/** Who and what, in one line, for a snoozed item. */
function summary(item: TrustItem): { readonly who: string; readonly what: string } {
	if (item.kind === "ask") return { who: item.ask.asker ?? "an agent", what: item.ask.question };
	if (item.kind === "blocked")
		return { who: item.agent.name, what: item.agent.activity ?? "is blocked" };
	return { who: item.kind, what: "" };
}

/** 'N snoozed': nothing is hidden for good; a click peeks at them, each with Unsnooze. */
export function SnoozedPeek({ snoozed }: { readonly snoozed: readonly SnoozedItem[] }) {
	const [open, setOpen] = useState(false);
	if (snoozed.length === 0) return null;
	return (
		<div className="snoozed">
			<button
				type="button"
				className="snoozed-toggle"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				{snoozed.length} snoozed {open ? "▴" : "▾"}
			</button>
			{open ? (
				<ul className="snoozed-list">
					{snoozed.map(({ item, until }) => {
						const key = snoozeKeyOf(item) ?? "";
						const { who, what } = summary(item);
						return (
							<li key={key}>
								<span className="snoozed-what">
									<strong>{who}</strong> {what}
								</span>
								<span className="snoozed-until">back {clock.format(until)}</span>
								<button
									type="button"
									className="snoozed-unsnooze"
									onClick={() => unsnoozeItem(key)}
								>
									Unsnooze
								</button>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}
