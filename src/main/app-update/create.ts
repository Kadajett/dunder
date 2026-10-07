import { homedir } from "node:os";
import { join } from "node:path";
import type { UpdateStatus } from "@shared/app-update";
import { buildApp } from "./build";
import { checkCheckout, dependenciesChanged } from "./git";
import { builtCommit, relaunchApp } from "./relaunch";
import { officeUpdateRequestsPath } from "./requests";
import { AppUpdater } from "./service";

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
	return new AppUpdater({
		built,
		requestsPath: officeUpdateRequestsPath(process.env, homedir()),
		statePath: join(options.userData, "app-update.json"),
		emit: options.emit,
		check: () => checkCheckout(options.root, built ?? "HEAD"),
		build: async (onLog) => {
			const install = await dependenciesChanged(options.root, built, "HEAD");
			return buildApp(options.root, onLog, { install });
		},
		relaunch: () => void relaunchApp(options.shutdown),
	});
}
