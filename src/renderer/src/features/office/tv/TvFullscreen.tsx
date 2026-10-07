import "./tv-fullscreen.css";
import { useEffect, useMemo, useState } from "react";
import { useShortcutSheet } from "../../../shortcuts";
import { channelBadge, channelForKey, TV_CHANNELS } from "./channels";
import { letterbox } from "./letterbox";
import { Pen, SCREEN_H, SCREEN_W } from "./paint/kit";
import { useTv } from "./tv-store";
import { type PaintSurface, usePaintLoop } from "./usePaintLoop";
import { useTvInputs } from "./useTvInputs";

/** Room kept below the picture for the remote-control bar, and around it. */
const CONTROLS_H = 76;
const PADDING = 28;
/** Backing-store scale cap: crisp on HiDPI without painting 8K canvases. */
const MAX_SCALE = 3;

function useWindowSize(): { readonly width: number; readonly height: number } {
	const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }));
	useEffect(() => {
		const onResize = (): void => setSize({ width: innerWidth, height: innerHeight });
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return size;
}
function selectChannel(
	key: string,
	select: (channel: (typeof TV_CHANNELS)[number]["id"]) => void,
): boolean {
	const channel = channelForKey(key);
	if (!channel) return false;
	select(channel);
	return true;
}

/** Remote control on the keyboard: 1–5 pick a channel, ←/→ flip, Esc closes. */
function useRemoteKeys(): void {
	const { select, step, setFullscreen } = useTv.getState();
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (useShortcutSheet.getState().open) return;
			if (!selectChannel(event.key, select)) {
				switch (event.key) {
					case "ArrowRight":
						step(1);
						break;
					case "ArrowLeft":
						step(-1);
						break;
					case "Escape":
						setFullscreen(false);
						break;
					default:
						return;
				}
			}
			event.preventDefault();
			event.stopPropagation();
		};
		// Capture phase: the overlay is modal, nothing underneath should see these keys.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [select, step, setFullscreen]);
}

/** The fullscreen canvas, its backing store sized to the on-screen picture for crisp text. */
function useCanvasSurface(canvas: HTMLCanvasElement | null, cssWidth: number): PaintSurface | null {
	const scale = Math.min(MAX_SCALE, Math.max(0.25, (cssWidth * devicePixelRatio) / SCREEN_W));
	return useMemo(() => {
		const ctx = canvas?.getContext("2d");
		if (!ctx) return null;
		const size = { width: Math.round(SCREEN_W * scale), height: Math.round(SCREEN_H * scale) };
		Object.assign(ctx.canvas, size);
		// Painters draw in 1280×720 units; resizing the canvas reset the transform.
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		return { pen: new Pen(ctx), painted: () => {}, wall: false };
	}, [canvas, scale]);
}

function RemoteBar() {
	const channel = useTv((state) => state.channel);
	const step = useTv((state) => state.step);
	const setFullscreen = useTv((state) => state.setFullscreen);
	return (
		<div className="tv-fs-bar">
			<button
				type="button"
				className="tv-fs-step"
				aria-label="Previous channel"
				onClick={() => step(-1)}
			>
				◀
			</button>
			<span className="tv-fs-channel">{channelBadge(channel)}</span>
			<button
				type="button"
				className="tv-fs-step"
				aria-label="Next channel"
				onClick={() => step(1)}
			>
				▶
			</button>
			<span className="tv-fs-hint">
				<kbd>1</kbd>–<kbd>{TV_CHANNELS.length}</kbd> · <kbd>←</kbd>
				<kbd>→</kbd> · <kbd>Esc</kbd> to close
			</span>
			<button
				type="button"
				className="tv-fs-close"
				aria-label="Close TV"
				onClick={() => setFullscreen(false)}
			>
				×
			</button>
		</div>
	);
}

function FullscreenTv() {
	const channel = useTv((state) => state.channel);
	const step = useTv((state) => state.step);
	const setFullscreen = useTv((state) => state.setFullscreen);
	const inputs = useTvInputs();
	const view = useWindowSize();
	const picture = letterbox(view.width, view.height - CONTROLS_H, SCREEN_W / SCREEN_H, PADDING);
	const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
	const surface = useCanvasSurface(canvas, picture.width);
	usePaintLoop(surface, channel, inputs, null);
	useRemoteKeys();
	const close = (): void => setFullscreen(false);

	return (
		<div className="tv-fs-layer" role="dialog" aria-modal="true" aria-label="Office TV">
			<button type="button" className="tv-fs-backdrop" aria-label="Close TV" onClick={close} />
			<button
				type="button"
				className="tv-fs-picture"
				aria-label="TV picture: click for the next channel"
				style={{ ...picture }}
				onClick={() => step(1)}
			>
				<canvas ref={setCanvas} />
			</button>
			<RemoteBar />
		</div>
	);
}

/** The wall TV blown up to fill the window, live, with remote controls. Mount once. */
export function TvFullscreen() {
	const open = useTv((state) => state.fullscreen);
	return open ? <FullscreenTv /> : null;
}
