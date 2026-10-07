import { homedir } from "node:os";
import { join } from "node:path";
import type { UpdateStatus } from "@shared/app-update";
import { createLogger } from "@shared/log/logger";
import { buildApp } from "./build";
import { restoreKept } from "./builds";
import { checkCheckout, dependenciesChanged } from "./git";
import { builtCommit, relaunchApp } from "./relaunch";
import { markUpdateRelaunch } from "./relaunch-mark";
import { officeUpdateRequestsPath } from "./requests";
import { noteRollback, previousBuild } from "./rollback";
import { AppUpdater } from "./service";

const log = createLogger("app-update");

export interface AppUpdateOptions {
	/** The app checkout: where git is polled and `npm install` / `npm run build` run. */
	readonly root: string;
	readonly userData: string;
	emit(status: UpdateStatus): void;
	/** Release what must not outlive the process (screens, services) before relaunching. */
	shutdown(): Promise<void>;
}

/** The app's updater, wired to git, the production build and Electron. */
export function createAppUpdater(options: AppUpdateOptions): AppUpdater {
	const built = builtCommit();
	const { root } = options;
	return new AppUpdater({
		built,
		requestsPath: officeUpdateRequestsPath(process.env, homedir()),
		statePath: join(options.userData, "app-update.json"),
		emit: options.emit,
		check: () => checkCheckout(root, built ?? "HEAD"),
		build: async (onLog) => {
			const install = await dependenciesChanged(root, built, "HEAD");
			return buildApp(root, onLog, { install, outgoing: built });
		},
		// Marked first, so the next launch knows it was an update (a call on picks up again).
		relaunch: () =>
			void markUpdateRelaunch(options.userData, Date.now()).then(() =>
				relaunchApp(options.shutdown),
			),
		previous: () => (built ? previousBuild(root, built) : Promise.resolve(null)),
		restore: async (previous) => {
			await restoreKept(root);
			if (!built) return;
			// Best effort: the rollback stands even when bd can't take the notes.
			const failed = await noteRollback(root, { good: previous.commit, bad: built }).catch(
				(error: unknown) => {
					log.warn("cannot list the rolled-back commits", { error });
					return [];
				},
			);
			if (failed.length > 0) log.warn("cannot note the rollback on beads", { beads: failed });
		},
	});
}
