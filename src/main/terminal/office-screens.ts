import { app } from "electron";
import type { HerdrApi } from "../herdr/api-client";
import { ObservePool } from "./observe-pool";
import { startObserveSession } from "./observe-session";
import { createPaneSizeResolver } from "./pane-size";
import { createPtySizeResolver } from "./pty-size";
import { TerminalRegistry } from "./registry";
import { ScreensService } from "./screens-service";

/** Upper bound on waiting for screen processes to exit when quitting. */
const SHUTDOWN_TIMEOUT_MS = 2_000;

export interface OfficeScreens {
	readonly screens: ScreensService;
	/** Interactive screens; the pool table asks it whether Jeremy has an agent open. */
	readonly terminals: TerminalRegistry;
	/** The office server is up: screens size themselves from its layout. */
	connect(api: HerdrApi): void;
	/** Release every pane (bounded wait); also run before the app quits. */
	stop(): Promise<void>;
}

/**
 * The agents' screens (observed and interactive terminals) and their
 * shutdown: quitting waits, briefly, until every herdr child has released its pane.
 */
export function createOfficeScreens(): OfficeScreens {
	const officeApi = Promise.withResolvers<HerdrApi>();
	/** Layout size: where a released screen puts the pane back. */
	const homeSize = createPaneSizeResolver(officeApi.promise);
	const observers = new ObservePool({
		start: startObserveSession,
		resolveSize: createPtySizeResolver(homeSize),
	});
	const terminals = new TerminalRegistry({
		homeSize,
		onPaneResized: (paneId) => observers.refresh(paneId),
	});
	const screens = new ScreensService(observers, terminals);
	let stopped = false;
	const stop = (): Promise<void> => {
		const timeout = Promise.withResolvers<void>();
		setTimeout(timeout.resolve, SHUTDOWN_TIMEOUT_MS);
		return Promise.race([screens.shutdown(), timeout.promise]).finally(() => {
			stopped = true;
		});
	};
	app.on("will-quit", (event) => {
		if (stopped) return;
		// Hold the quit until the screens are released.
		event.preventDefault();
		void stop().finally(() => app.quit());
	});
	return { screens, terminals, connect: (api) => officeApi.resolve(api), stop };
}
