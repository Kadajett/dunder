import { createLogger } from "@shared/log/logger";
import { shell, type WebContents } from "electron";

const log = createLogger("external-links");

const EXTERNAL_PROTOCOLS: Record<string, true> = { "http:": true, "https:": true, "mailto:": true };

/** The URL to hand to the system browser, or null for anything that must not leave the app. */
export function externalUrl(raw: string): string | null {
	try {
		const url = new URL(raw);
		return EXTERNAL_PROTOCOLS[url.protocol] ? url.href : null;
	} catch {
		return null;
	}
}

function openOutside(raw: string): void {
	const url = externalUrl(raw);
	if (!url) {
		log.warn("blocked link", { url: raw });
		return;
	}
	void shell
		.openExternal(url)
		.catch((error: unknown) => log.warn("could not open link", { url, error }));
}

/**
 * The app window never navigates or opens windows: links (e.g. in the Chief
 * chat's Markdown) open in the system browser instead.
 */
export function guardNavigation(contents: WebContents): void {
	contents.setWindowOpenHandler(({ url }) => {
		openOutside(url);
		return { action: "deny" };
	});
	contents.on("will-navigate", (event, url) => {
		event.preventDefault();
		openOutside(url);
	});
}
