import { type ArchetypeId, archetype, type Harness } from "./archetypes.js";

/** Single-quotes a value for POSIX sh. */
export function shQuote(value: string): string {
	return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * `~/.local/bin/dunder`. The AppImage's chrome-sandbox can never be setuid, so
 * Chromium sandboxes through unprivileged user namespaces; where those are
 * restricted (Ubuntu 24.04+'s AppArmor default, say) it must run with
 * `--no-sandbox`. Checked on every launch, since sysctls change.
 */
export function launcherScript(appImage: string): string {
	return [
		"#!/bin/sh",
		"# Dunder launcher, written by `npx dunder-ai setup` (re-running setup rewrites it).",
		`app=${shQuote(appImage)}`,
		'if [ ! -x "$app" ]; then',
		'\techo "Dunder is not installed at $app; run: npx dunder-ai setup" >&2',
		"\texit 1",
		"fi",
		"userns_restricted() {",
		'\t[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ] ||',
		'\t\t[ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = 0 ] ||',
		'\t\t[ "$(cat /proc/sys/user/max_user_namespaces 2>/dev/null)" = 0 ]',
		"}",
		'if userns_restricted; then set -- --no-sandbox "$@"; fi',
		"# AppImages mount through FUSE 2; without libfuse2, extract and run instead.",
		"if ! { ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null; } | grep -q 'libfuse\\.so\\.2'; then",
		"\texport APPIMAGE_EXTRACT_AND_RUN=1",
		"fi",
		'exec "$app" "$@"',
		"",
	].join("\n");
}

/** Desktop Entry spec: Exec arguments with spaces are double-quoted. */
function desktopQuote(value: string): string {
	return /[\s"\\`$]/.test(value) ? `"${value.replace(/["\\`$]/g, "\\$&")}"` : value;
}

export function desktopEntry(launcher: string, icon: string): string {
	return [
		"[Desktop Entry]",
		"Type=Application",
		"Name=Dunder",
		"Comment=A 3D office where your AI coding agents work",
		`Exec=${desktopQuote(launcher)} %U`,
		`Icon=${icon}`,
		"Terminal=false",
		"Categories=Development;",
		"Keywords=agents;ai;herdr;office;",
		"StartupWMClass=Dunder",
		"",
	].join("\n");
}

/** One worker in `seed.json`; the app hires these into an empty roster on first run. */
export interface SeedAgent {
	readonly archetype: ArchetypeId;
	readonly name: string;
	/** The archetype id: the app appends `docs/agents/archetypes/<role>.md` to its prompt. */
	readonly role: string;
	readonly harness: Harness;
	readonly workspaceLabel: string;
	readonly cwd: string;
	readonly skills: readonly string[];
}

export interface SeedPick {
	readonly id: ArchetypeId;
	readonly harness: Harness;
}

export const SEED_VERSION = 1;

/** `<userData>/seed.json`, stable for the same picks so re-runs leave it untouched. */
export function seedContent(picks: readonly SeedPick[], cwd: string): string {
	const agents: SeedAgent[] = picks.map(({ id, harness }) => {
		const { name, room, skills } = archetype(id);
		return { archetype: id, name, role: id, harness, workspaceLabel: room, cwd, skills };
	});
	return `${JSON.stringify({ version: SEED_VERSION, agents }, null, "\t")}\n`;
}
