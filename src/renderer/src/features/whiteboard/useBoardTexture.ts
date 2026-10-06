import { useThree } from "@react-three/fiber";
import { createLogger } from "@shared/log/logger";
import type { WhiteboardSnapshot } from "@shared/whiteboard";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { BoardPainter } from "./board-paint";

const log = createLogger("whiteboard");

/** Texture size: the board face is 2:1. */
const SIZE = { width: 1024, height: 512 } as const;

/**
 * The room board's face: main's current document, painted once on mount and
 * again only when main broadcasts a change (an agent's note, an editor save,
 * a clear, another company). Nothing repaints per frame.
 */
export function useBoardTexture(): CanvasTexture {
	const gl = useThree((state) => state.gl);
	const invalidate = useThree((state) => state.invalidate);
	const face = useMemo(() => {
		const canvas = document.createElement("canvas");
		Object.assign(canvas, SIZE);
		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		const ctx = canvas.getContext("2d");
		return { painter: ctx && new BoardPainter(ctx), texture };
	}, []);

	useEffect(() => {
		face.texture.anisotropy = gl.capabilities.getMaxAnisotropy();
		return () => face.texture.dispose();
	}, [gl, face]);

	useEffect(() => {
		const { painter, texture } = face;
		if (!painter) return;
		const paint = (snapshot: WhiteboardSnapshot | null): void => {
			painter.paint(SIZE, snapshot);
			texture.needsUpdate = true;
			invalidate();
		};
		paint(null);
		// A preload without the whiteboard API (hot reload, scene shots): the empty board.
		if (!("whiteboard" in window.office)) return;
		let live = true;
		window.office.whiteboard.get().then(
			(board) => live && paint(board.snapshot),
			(error: unknown) => log.warn("board not loaded", { error }),
		);
		const off = window.office.whiteboard.onChanged((change) => paint(change.board.snapshot));
		return () => {
			live = false;
			off();
		};
	}, [face, invalidate]);

	return face.texture;
}
