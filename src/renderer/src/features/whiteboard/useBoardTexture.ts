import { useThree } from "@react-three/fiber";
import { createLogger } from "@shared/log/logger";
import type { WhiteboardScene } from "@shared/whiteboard";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { fitView } from "./board-view";

const log = createLogger("whiteboard");

/** Texture size: the board face is 2:1. */
const SIZE = { width: 1024, height: 512 } as const;
const BOARD_WHITE = "#f8f7f3";
/** A burst of changes (an agent posting several notes) repaints once. */
const REPAINT_DEBOUNCE_MS = 200;

/** The scene at scene scale, or null when nothing is drawn. */
async function render(scene: WhiteboardScene | null): Promise<HTMLCanvasElement | null> {
	if (!scene) return null;
	// Code-split on purpose: a static import would put Excalidraw (several MB) in the office's startup bundle.
	const { renderScene } = await import("./board-export");
	return renderScene(scene, BOARD_WHITE);
}

/** Fill the face with `drawing`, framed, or with the empty-board hint. */
function draw(ctx: CanvasRenderingContext2D, drawing: HTMLCanvasElement | null): void {
	ctx.fillStyle = BOARD_WHITE;
	ctx.fillRect(0, 0, SIZE.width, SIZE.height);
	if (drawing) {
		const view = fitView(
			{ x: 0, y: 0, w: drawing.width, h: drawing.height },
			SIZE.width,
			SIZE.height,
		);
		ctx.drawImage(drawing, view.x, view.y, drawing.width * view.scale, drawing.height * view.scale);
		return;
	}
	ctx.font = `600 ${Math.round(SIZE.height * 0.07)}px Inter, system-ui, sans-serif`;
	ctx.fillStyle = "#c9c4b8";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("Brainstorm board · click to draw", SIZE.width / 2, SIZE.height / 2);
}

/**
 * The room board's face: main's current scene, painted on mount and again only
 * when main broadcasts a change (an agent's note, an editor save, a clear,
 * another company), debounced. Nothing repaints per frame.
 */
export function useBoardTexture(): CanvasTexture {
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const face = useMemo(() => {
		const canvas = document.createElement("canvas");
		Object.assign(canvas, SIZE);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		return { ctx: canvas.getContext("2d"), texture };
	}, []);

	useEffect(() => {
		face.texture.anisotropy = gl.capabilities.getMaxAnisotropy();
		return () => face.texture.dispose();
	}, [gl, face]);

	useEffect(() => {
		const { ctx, texture } = face;
		if (!ctx) return;
		let latest = 0;
		let timer: number | undefined;
		const repaint = (scene: WhiteboardScene | null): void => {
			latest += 1;
			const mine = latest;
			render(scene)
				.then((drawing) => {
					// An older, slower export must not overwrite a newer one.
					if (mine !== latest) return;
					draw(ctx, drawing);
					texture.needsUpdate = true;
					invalidate();
				})
				.catch((error: unknown) => log.warn("board not painted", { error }));
		};
		repaint(null);
		// A preload without the whiteboard API (hot reload, scene shots): the empty board.
		if (!("whiteboard" in window.office)) return;
		window.office.whiteboard.get().then(
			(board) => repaint(board.scene),
			(error: unknown) => log.warn("board not loaded", { error }),
		);
		const off = window.office.whiteboard.onChanged((change) => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => repaint(change.board.scene), REPAINT_DEBOUNCE_MS);
		});
		return () => {
			window.clearTimeout(timer);
			latest += 1;
			off();
		};
	}, [face, invalidate]);

	return face.texture;
}
