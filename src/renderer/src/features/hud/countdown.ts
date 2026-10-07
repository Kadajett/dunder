import { useLayoutEffect, useRef, useState } from "react";

const secondsUntil = (at: number): number => Math.max(0, Math.ceil((at - Date.now()) / 1000));

/**
 * Whole seconds until `at` (0 when there is none), ticking down. Checked four
 * times a second, but state is set only when the number changes and the check
 * stops at 0: React keeps even a same-value setState queued until the
 * component next renders, so setting it blindly from a timer grows that queue
 * for as long as the component shows something else (office-82q).
 */
export function useSecondsLeft(at: number | null): number {
	const [seconds, setSeconds] = useState(() => (at === null ? 0 : secondsUntil(at)));
	const shown = useRef(seconds);
	// Before paint, so a new countdown never shows the previous number first.
	useLayoutEffect(() => {
		const show = (next: number): void => {
			if (next === shown.current) return;
			shown.current = next;
			setSeconds(next);
		};
		if (at === null) return show(0);
		const update = (): void => {
			const next = secondsUntil(at);
			show(next);
			if (next === 0) clearInterval(timer);
		};
		const timer = setInterval(update, 250);
		update();
		return () => clearInterval(timer);
	}, [at]);
	return seconds;
}
