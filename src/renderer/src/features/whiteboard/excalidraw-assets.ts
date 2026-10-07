/**
 * The CSP-hashed bootstrap in renderer/index.html sets this before ESM modules
 * evaluate and routes Excalidraw's file:// font reads through preload IPC.
 */
declare global {
	interface Window {
		EXCALIDRAW_ASSET_PATH?: string | string[];
	}
}

window.EXCALIDRAW_ASSET_PATH ??= new URL("excalidraw-assets/", document.baseURI).href;

/** A module imported for its side effect. */
export {};
