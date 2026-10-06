// @xterm/headless 6.0.0 ships a `module` field pointing at a missing file, so Vite
// cannot resolve the bare specifier; the renderer imports the ESM build directly.
declare module "@xterm/headless/lib-headless/xterm-headless.mjs" {
	export * from "@xterm/headless";
}
