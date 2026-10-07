import { useEffect, useRef, useState } from "react";
import { badgeVisible, type ChannelId } from "./channels";
import type { Pen } from "./paint/kit";
import { frameKey, paintFrame, type TvInputs } from "./screen";

/** Fastest a TV picture repaints (≈4 fps); frames that look unchanged are skipped. */
const TICK_MS = 250;

/** Canvas fonts must be loaded before the first paint or text falls back to a system face. */
const FONT_FACES = [
	'400 32px "Inter"',
	'600 32px "Inter"',
	'700 32px "Inter"',
	'400 32px "JetBrains Mono"',
	'700 32px "JetBrains Mono"',
];

function useFontsReady(): boolean {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		let live = true;
		void Promise.allSettled(FONT_FACES.map((face) => document.fonts.load(face))).then(() => {
			if (live) setReady(true);
		});
		return () => {
			live = false;
		};
	}, []);
	return ready;
}

/**
 * Somewhere a TV picture is painted: the wall set's texture or the fullscreen canvas.
 * Make a new surface object whenever its canvas is replaced or resized: that forces a repaint.
 */
export interface PaintSurface {
	readonly pen: Pen;
	/** Called after each repaint (e.g. flag a texture for upload). */
	readonly painted: () => void;
	/** The wall set (seen small, across the room) rather than the fullscreen overlay. */
	readonly wall: boolean;
}

/**
 * Keep `surface` showing `channel`: check ~4 times a second and repaint only
 * when the picture would change. `switchedAt` drives the channel badge (null: none).
 */
export function usePaintLoop(
	surface: PaintSurface | null,
	channel: ChannelId,
	inputs: TvInputs,
	switchedAt: number | null,
): void {
	const fontsReady = useFontsReady();
	// What the surface currently shows; a replaced surface (e.g. a fresh canvas) is blank.
	const last = useRef<{ surface: PaintSurface | null; key: string }>({ surface: null, key: "" });
	useEffect(() => {
		if (!surface) return;
		const tick = (): void => {
			const now = Date.now();
			const frame = {
				channel,
				inputs,
				now,
				showBadge: badgeVisible(switchedAt, now),
				wall: surface.wall,
			};
			const key = `${fontsReady}|${frameKey(frame)}`;
			if (last.current.surface === surface && last.current.key === key) return;
			last.current = { surface, key };
			paintFrame(surface.pen, frame);
			surface.painted();
		};
		tick();
		const timer = setInterval(tick, TICK_MS);
		return () => clearInterval(timer);
	}, [surface, channel, inputs, switchedAt, fontsReady]);
}
