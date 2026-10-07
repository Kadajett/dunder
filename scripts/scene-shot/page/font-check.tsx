import "@renderer/features/whiteboard/excalidraw-assets";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { renderScene } from "@renderer/features/whiteboard/board-export";

const setResult = (result: string): void => {
	document.documentElement.dataset["fontCheck"] = result;
};

try {
	const fontFallback = await fetch(
		"https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Xiaolai/Xiaolai-Regular-09850c4077f3fffe707905872e0e2460.woff2",
	);
	if (!fontFallback.ok) throw new Error(`local font fallback failed (${fontFallback.status})`);
	const elements = convertToExcalidrawElements([
		{ type: "text", x: 0, y: 0, text: "漢字 中文 한국어" },
	]);
	await renderScene({ elements, files: {} }, "#ffffff");
	setResult("passed");
} catch (error) {
	document.documentElement.dataset["fontCheck"] =
		error instanceof Error ? `failed: ${error.message}` : "failed: unknown error";
}
