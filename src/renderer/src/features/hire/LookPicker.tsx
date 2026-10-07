import {
	hatColorSide,
	type LookPart,
	partOption,
	stepPart,
	toggleHatColor,
} from "@shared/avatar/look";
import type { AvatarStyle } from "@shared/avatar/style";
import { useEffect, useState } from "react";

/** How long a note about a forced change (hat off, hair stepped) stays up. */
const NOTE_MS = 3_000;

const ROWS: readonly { readonly part: LookPart; readonly label: string; readonly face?: true }[] = [
	{ part: "hair", label: "Hair" },
	{ part: "hairColor", label: "Hair colour" },
	{ part: "skin", label: "Skin" },
	{ part: "eyes", label: "Eyes", face: true },
	{ part: "brows", label: "Brows", face: true },
	{ part: "mouth", label: "Mouth", face: true },
	{ part: "outfit", label: "Outfit" },
	{ part: "outfitColor", label: "Outfit colour" },
	{ part: "glasses", label: "Glasses" },
	{ part: "headwear", label: "Headwear" },
];

interface RowProps {
	readonly label: string;
	readonly style: AvatarStyle;
	readonly part: LookPart;
	readonly onStep: (part: LookPart, delta: 1 | -1) => void;
}

/** One part: ‹ · current option · n/N · ›. Buttons, so Tab reaches them and Enter or Space steps. */
function PartRow({ label, style, part, onStep }: RowProps) {
	const option = partOption(style, part);
	return (
		<fieldset className="look-row" aria-label={label}>
			<span className="look-label">{label}</span>
			<button
				type="button"
				className="look-step"
				aria-label={`Previous ${label.toLowerCase()}`}
				onClick={() => onStep(part, -1)}
			>
				‹
			</button>
			<span className="look-value">{option.label}</span>
			<span className="look-count">
				{option.position}/{option.count}
			</span>
			<button
				type="button"
				className="look-step"
				aria-label={`Next ${label.toLowerCase()}`}
				onClick={() => onStep(part, 1)}
			>
				›
			</button>
		</fieldset>
	);
}

/** The hat's colour: the outfit's main colour or its accent. Only while a hat is on. */
function HatColor({
	style,
	onPick,
}: {
	readonly style: AvatarStyle;
	readonly onPick: (style: AvatarStyle) => void;
}) {
	const side = hatColorSide(style);
	if (!side) return null;
	return (
		<button
			type="button"
			className="look-hat-color"
			aria-label={`Hat colour: ${side === "accent" ? "accent" : "outfit colour"}. Switch`}
			onClick={() => onPick(toggleHatColor(style))}
		>
			<i style={{ background: style.headwear?.color }} />
			Hat in the {side === "accent" ? "accent" : "outfit colour"} · switch
		</button>
	);
}

/** A note shown for `NOTE_MS` after a pick that had to change another part too; plain picks leave it up. */
function useNote(): [string | null, (note: string | null) => void] {
	const [note, setNote] = useState<{ readonly text: string; readonly at: number } | null>(null);
	useEffect(() => {
		if (!note) return;
		const timer = setTimeout(() => setNote(null), NOTE_MS);
		return () => clearTimeout(timer);
	}, [note]);
	return [
		note?.text ?? null,
		(text) => {
			if (text) setNote({ text, at: performance.now() });
		},
	];
}

/**
 * The new hire's look, part by part, over the one live preview: each step
 * changes `style` at once. Hatless hair and a hat never combine; the last
 * pick wins and a short note says what else changed.
 */
export function LookPicker({
	style,
	onPick,
}: {
	readonly style: AvatarStyle;
	readonly onPick: (style: AvatarStyle) => void;
}) {
	const [note, showNote] = useNote();
	const step = (part: LookPart, delta: 1 | -1): void => {
		const result = stepPart(style, part, delta);
		onPick(result.style);
		showNote(result.note);
	};
	return (
		<div className="look-picker">
			{ROWS.map((row) => (
				<div key={row.part} className="look-row-wrap" data-face={row.face ?? false}>
					{row.part === "eyes" ? <span className="look-group">Face</span> : null}
					<PartRow label={row.label} style={style} part={row.part} onStep={step} />
				</div>
			))}
			<HatColor style={style} onPick={onPick} />
			<p className="look-note" role="status">
				{note}
			</p>
		</div>
	);
}
