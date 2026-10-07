import "@renderer/features/whiteboard/excalidraw-assets";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { WhiteboardApi, WhiteboardBoard } from "@shared/whiteboard";

/**
 * A brainstorm in progress, for the scene shots' whiteboard: a heading, three
 * agents' sticky notes, an arrow between two of them and a ring around one.
 */

const note = (text: string, color: string, x: number) =>
	({
		type: "rectangle",
		x,
		y: 140,
		width: 200,
		height: 200,
		backgroundColor: color,
		fillStyle: "solid",
		strokeColor: "transparent",
		// The label would inherit the note's transparent stroke.
		label: { text, fontSize: 22, strokeColor: "#1e1e1e" },
	}) as const;

const elements = convertToExcalidrawElements([
	{ type: "text", x: 60, y: 30, text: "Q4 launch: ideas", fontSize: 44 },
	note("nora: demo day for the fintech CTO", "#ffd8a8", 60),
	note("ava: ship the voice inbox first", "#b2f2bb", 340),
	note("max: one owner per launch task", "#a5d8ff", 620),
	{ type: "arrow", x: 270, y: 240, width: 60, height: 0, strokeColor: "#1971c2" },
	{
		type: "ellipse",
		x: 310,
		y: 110,
		width: 260,
		height: 260,
		strokeColor: "#e03131",
		strokeWidth: 2,
	},
]);

export const SAMPLE_BOARD: WhiteboardBoard = {
	companyId: "dunder-mifflin",
	revision: 1,
	scene: { elements },
};

/** `window.office.whiteboard` for the scene shots: the sample board, never changing. */
export const fakeWhiteboard: WhiteboardApi = {
	get: async () => SAMPLE_BOARD,
	put: async () => ({ state: "rejected", reason: "scene-shot", board: SAMPLE_BOARD }),
	makeIdea: async () => {
		throw new Error("scene-shot cannot create Beads");
	},
	readFont: async (assetPath) => {
		const response = await fetch(`/excalidraw-assets/${assetPath}`);
		if (!response.ok) throw new Error(`font fixture returned ${response.status}`);
		return new Uint8Array(await response.arrayBuffer());
	},
	onChanged: () => () => undefined,
};
