import { useEffect, useState } from "react";
import { useCall } from "./call-store";

const BARS = 28;

/** RMS to a 0–1 bar height on a log scale, so normal speech fills about half to most of it. */
export function barHeight(level: number): number {
	return Math.min(1, Math.max(0.04, Math.log10(1 + level * 400) / 2.2));
}

/** The mic's recent levels as a scrolling bar waveform: speaking visibly moves it. */
export function LevelMeter() {
	const level = useCall((state) => state.level);
	const muted = useCall((state) => state.muted);
	const [history, setHistory] = useState<readonly number[]>(() => Array<number>(BARS).fill(0));
	useEffect(() => {
		setHistory((previous) => [...previous.slice(1), muted ? 0 : level]);
	}, [level, muted]);
	return (
		// Decorative: the strip's label already says whether he is heard.
		<div className="chief-meter" aria-hidden="true">
			{history.map((value, index) => (
				// Fixed positions in a rolling window.
				// biome-ignore lint/suspicious/noArrayIndexKey: bars are positions, not items
				<span key={index} style={{ height: `${barHeight(value) * 100}%` }} />
			))}
		</div>
	);
}
