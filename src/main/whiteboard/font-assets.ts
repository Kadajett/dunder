import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Reads only font files copied beside the packaged renderer. */
export function readExcalidrawFont(assetPath: string): Promise<Uint8Array> {
	return readFile(resolve(__dirname, "../../renderer/excalidraw-assets", assetPath));
}
