import "./excalidraw-assets";
import { exportToCanvas } from "@excalidraw/excalidraw";
import type { WhiteboardScene } from "@shared/whiteboard";

/**
 * The board's drawing as a canvas at scene scale (1 px per scene unit), with a
 * little padding; null when nothing visible is on it. Loaded lazily with
 * Excalidraw, so the office does not pay for it until the board has content.
 */
export async function renderScene(
	scene: WhiteboardScene,
	background: string,
): Promise<HTMLCanvasElement | null> {
	const elements = scene.elements.filter((element) => !element.isDeleted);
	if (elements.length === 0) return null;
	return exportToCanvas({
		elements,
		files: scene.files ?? {},
		appState: { exportBackground: true, viewBackgroundColor: background },
		exportPadding: 24,
	});
}
