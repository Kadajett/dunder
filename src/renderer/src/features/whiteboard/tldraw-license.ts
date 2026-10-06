/**
 * tldraw 4+ needs a license key in production: without one, its
 * LicenseProvider swaps the editor for an empty element 5 s after mount. It
 * treats a page as development only when served over http:, or https: on a
 * loopback host, or in a non-production build. The installed app is a
 * production build over file://, so it needs a key (a "native" license, matched
 * against the file:// URL). The build reads it from `TLDRAW_LICENSE_KEY` or
 * `~/.config/dunder/tldraw-license-key` (see electron.vite.config.ts).
 */

/** The key baked in at build time, or "" without one. */
export const TLDRAW_LICENSE_KEY: string = import.meta.env["VITE_TLDRAW_LICENSE_KEY"] ?? "";

interface PageLocation {
	readonly protocol: string;
	readonly hostname: string;
}

const isLoopback = (hostname: string): boolean =>
	hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname);

/** Whether tldraw will blank the editor here: no key, in a production build, outside tldraw's development origins. */
export function editorNeedsLicense(key: string, page: PageLocation, production: boolean): boolean {
	if (key || !production) return false;
	if (page.protocol === "http:") return false;
	return !(page.protocol === "https:" && isLoopback(page.hostname.toLowerCase()));
}
