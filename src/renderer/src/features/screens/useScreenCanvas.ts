import type { ScreenState } from "@shared/screens";
import { useCallback, useEffect, useState } from "react";
import { previewDelay } from "./preview-throttle";
import { useScreenTexture } from "./useScreenTexture";

/** Copies the pane's shared painter canvas into one DOM canvas, throttled, only while shown. */
class PreviewCopier {
	#canvas: HTMLCanvasElement | null = null;
	#source: OffscreenCanvas | null = null;
	#visible = false;
	#lastAt: number | undefined;
	#timer: number | undefined;

	attach(canvas: HTMLCanvasElement | null, source: OffscreenCanvas | null, visible: boolean): void {
		this.#canvas = canvas;
		this.#source = source;
		this.#visible = visible;
		// The painter may already hold a clean frame (painted for another consumer): show it.
		this.request();
	}

	detach(): void {
		window.clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#canvas = null;
		this.#source = null;
		this.#visible = false;
	}

	/** Called after every repaint of the shared painter. */
	request(): void {
		if (!this.#visible || this.#timer !== undefined) return;
		const delay = previewDelay(this.#lastAt, performance.now());
		this.#timer = window.setTimeout(() => {
			this.#timer = undefined;
			this.#copy();
		}, delay);
	}

	#copy(): void {
		const canvas = this.#canvas;
		const source = this.#source;
		if (!canvas || !source || !this.#visible) return;
		if (canvas.width !== source.width) canvas.width = source.width;
		if (canvas.height !== source.height) canvas.height = source.height;
		canvas.getContext("2d", { alpha: false })?.drawImage(source, 0, 0);
		this.#lastAt = performance.now();
	}
}

/** Whether any part of `element` is on screen (scroll containers and the window included). */
function useOnScreen(element: Element | null): boolean {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		if (!element) {
			setVisible(false);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			const latest = entries.at(-1);
			if (latest) setVisible(latest.isIntersecting);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	return visible;
}

/**
 * Live preview of a pane's screen in a DOM `<canvas>`, drawn from the same shared
 * headless painter the 3D monitors use. Repaints only while the canvas is on
 * screen, at most ~4 fps. Pass the canvas from a callback ref.
 */
export function useScreenCanvas(
	paneId: string | undefined,
	canvas: HTMLCanvasElement | null,
): ScreenState {
	const visible = useOnScreen(canvas);
	const [copier] = useState(() => new PreviewCopier());
	const invalidate = useCallback(() => copier.request(), [copier]);
	const { texture, state } = useScreenTexture(paneId, { visible, invalidate });
	const source = texture?.image ?? null;
	useEffect(() => {
		copier.attach(canvas, source, visible);
		return () => copier.detach();
	}, [copier, canvas, source, visible]);
	return state;
}
