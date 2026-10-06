/**
 * Excalidraw loads its fonts from `window.EXCALIDRAW_ASSET_PATH`, falling back
 * to a CDN the CSP blocks. The build ships them in `excalidraw-assets/` next to
 * index.html (scripts/vite/excalidraw-assets.ts), so point Excalidraw there.
 * Import this before `@excalidraw/excalidraw` in every module that uses it.
 */
declare global {
	interface Window {
		EXCALIDRAW_ASSET_PATH?: string | string[];
	}
}

window.EXCALIDRAW_ASSET_PATH = new URL("excalidraw-assets/", document.baseURI).href;

/** A module (for the global augmentation above); imported for its side effect. */
export {};
