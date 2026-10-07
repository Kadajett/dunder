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
import { noteRollback, previousBuild, type RollbackRange, rollbackText } from "./rollback";
import { AppUpdater } from "./service";

const log = createLogger("app-update");

export interface AppUpdateOptions {
	/** The app checkout: where git is polled and `npm install` / `npm run build` run. */
	readonly root: string;
	readonly userData: string;
	emit(status: UpdateStatus): void;
	/** Release what must not outlive the process (screens, services) before relaunching. */
	shutdown(): Promise<void>;
	/** Say it to the chief of staff (a rollback); false when there's no chief to tell. */
	tellChief(text: string): Promise<boolean>;
}

/** Beads in the range get the rollback note; the text comes back for Max (without bead ids when bd can't list them). */
async function noteOnBeads(root: string, range: RollbackRange): Promise<string> {
	try {
		const { text, failed } = await noteRollback(root, range);
		if (failed.length > 0) log.warn("cannot note the rollback on beads", { beads: failed });
		return text;
	} catch (error) {
		log.warn("cannot list the rolled-back commits", { error });
		return rollbackText(range, []);
	}
}

/** The app's updater, wired to git, the production build and Electron. */
export function createAppUpdater(options: AppUpdateOptions): AppUpdater {
	const built = builtCommit();
	const { root } = options;
	return new AppUpdater({
		built,
		requestsPath: officeUpdateRequestsPath(process.env, homedir()),
		statePath: join(options.userData, "app-update.json"),
		settingsPath: join(options.userData, "update-batching.json"),
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
		restore: async (previous, whatBroke) => {
			await restoreKept(root);
			if (!built) return;
			// Best effort: the rollback stands even when bd or the chief can't take the note.
			const range = { good: previous.commit, bad: built, ...(whatBroke ? { whatBroke } : {}) };
			const text = await noteOnBeads(root, range);
			if (!(await options.tellChief(`[office] ${text}`).catch(() => false)))
				log.warn("the chief wasn't told about the rollback");
		},
	});
}
