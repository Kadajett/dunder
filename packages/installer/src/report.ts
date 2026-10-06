import { shQuote } from "./files.js";
import { tildify } from "./paths.js";
import type { Action, Plan } from "./plan.js";
import { SITE_DOWNLOAD_URL } from "./release.js";

/** The concrete thing a step does, as one line a user can check. */
export function describeAction(action: Action, home: string): string {
	const short = (path: string) => tildify(path, home);
	switch (action.kind) {
		case "run": {
			const command = [action.command, ...action.args].map(shQuote).join(" ");
			return action.cwd === undefined
				? `$ ${command}`
				: `$ (cd ${short(action.cwd)} && ${command})`;
		}
		case "install-app": {
			const url = action.release?.url ?? `${SITE_DOWNLOAD_URL} (or GitHub's latest release)`;
			const check = action.release?.sha256
				? `sha256 ${action.release.sha256.slice(0, 12)}…`
				: "AppImage header";
			return `download ${url}, verify (${check}), install to ${short(action.path)}`;
		}
		case "write":
			return `write ${short(action.path)} (mode ${action.mode.toString(8)})`;
		case "link":
			return `link ${short(action.path)} → ${action.target}`;
	}
}

export function formatPlan(plan: Plan, home: string, dryRun: boolean): string {
	const lines = [dryRun ? "Dunder setup (dry run: nothing will change)" : "Dunder setup", ""];
	if (plan.present.length > 0) {
		lines.push("Already in place:", ...plan.present.map((entry) => `  ✓ ${entry}`), "");
	}
	if (plan.steps.length === 0) lines.push("Nothing to do: everything is up to date.", "");
	else {
		lines.push(dryRun ? "Would do:" : "Plan:");
		plan.steps.forEach((step, index) => {
			const ask = step.consent ? " (asks first)" : "";
			lines.push(
				`  ${index + 1}. ${step.title}${ask}`,
				`     ${describeAction(step.action, home)}`,
			);
		});
		lines.push("");
	}
	if (plan.blockers.length > 0) {
		lines.push("Blocked:", ...plan.blockers.map((entry) => `  ✗ ${entry}`), "");
	}
	if (plan.notes.length > 0) lines.push("Notes:", ...plan.notes.map((entry) => `  • ${entry}`), "");
	return lines.join("\n");
}
