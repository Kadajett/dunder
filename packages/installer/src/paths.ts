import { join } from "node:path";

export type Env = Readonly<Record<string, string | undefined>>;

/** Everywhere setup reads or writes, for one user. */
export interface Paths {
	readonly home: string;
	/** `~/.local`: npm global installs go here, so their commands land in `binDir`. */
	readonly localPrefix: string;
	readonly binDir: string;
	readonly appDir: string;
	readonly appImage: string;
	/** Which release `appImage` is: `{ version, sha256, ... }`. */
	readonly installRecord: string;
	readonly launcher: string;
	readonly desktopEntry: string;
	readonly icon: string;
	/** Electron's userData for productName `Dunder`. */
	readonly userData: string;
	readonly seed: string;
	/** Rosters that mean the office already has staff (Dunder's, then herdr office's). */
	readonly rosters: readonly string[];
	readonly engineeringCheckout: string;
}

export function resolvePaths(home: string, env: Env): Paths {
	const localPrefix = join(home, ".local");
	const dataHome = env["XDG_DATA_HOME"] || join(localPrefix, "share");
	const configHome = env["XDG_CONFIG_HOME"] || join(home, ".config");
	const appDir = join(dataHome, "dunder");
	const binDir = join(localPrefix, "bin");
	const userData = join(configHome, "Dunder");
	return {
		home,
		localPrefix,
		binDir,
		appDir,
		appImage: join(appDir, "Dunder.AppImage"),
		installRecord: join(appDir, "install.json"),
		launcher: join(binDir, "dunder"),
		desktopEntry: join(dataHome, "applications", "dunder.desktop"),
		icon: join(dataHome, "icons", "hicolor", "scalable", "apps", "dunder.svg"),
		userData,
		seed: join(userData, "seed.json"),
		rosters: [join(userData, "roster.json"), join(configHome, "herdr office", "roster.json")],
		engineeringCheckout: join(appDir, "engineering"),
	};
}

/** `/home/me/x` → `~/x`, for display only. */
export function tildify(path: string, home: string): string {
	return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
