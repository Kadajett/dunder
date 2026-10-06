import { createInterface, type Interface } from "node:readline/promises";
import {
	ARCHETYPES,
	type ArchetypeId,
	DEFAULT_ARCHETYPES,
	parseArchetypePicks,
} from "./archetypes.js";

/** Questions setup asks a person at a terminal. */
export interface Asker {
	confirm(question: string, fallback: boolean): Promise<boolean>;
	pickArchetypes(): Promise<readonly ArchetypeId[]>;
	close(): void;
}

async function confirm(rl: Interface, question: string, fallback: boolean): Promise<boolean> {
	const hint = fallback ? "[Y/n]" : "[y/N]";
	for (;;) {
		const answer = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
		if (answer === "") return fallback;
		if (answer === "y" || answer === "yes") return true;
		if (answer === "n" || answer === "no") return false;
	}
}

function archetypeMenu(): string {
	const lines = ["", "Who should your office start with?", ""];
	ARCHETYPES.forEach((entry, index) => {
		lines.push(
			`  ${index + 1}. ${entry.id} — ${entry.name}, ${entry.title.toLowerCase()} in #${entry.room}`,
			`     ${entry.brief}`,
			`     harness: ${entry.harness} · model: ${entry.modelHint}`,
			`     skills: ${entry.skills.join(", ")}`,
		);
	});
	const defaults = DEFAULT_ARCHETYPES.join(", ");
	lines.push("", `Numbers or names, comma separated (Enter: ${defaults}; "none" for nobody).`);
	return lines.join("\n");
}

async function pickArchetypes(rl: Interface): Promise<readonly ArchetypeId[]> {
	process.stdout.write(`${archetypeMenu()}\n`);
	for (;;) {
		const picks = parseArchetypePicks(await rl.question("> "));
		if (picks.ok) return picks.ids;
		process.stdout.write(`${picks.error}; try again.\n`);
	}
}

export function terminalAsker(): Asker {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return {
		confirm: (question, fallback) => confirm(rl, question, fallback),
		pickArchetypes: () => pickArchetypes(rl),
		close: () => rl.close(),
	};
}

/** `--yes`: every question takes its default. */
export const defaultsAsker: Asker = {
	confirm: async (_question, fallback) => fallback,
	pickArchetypes: async () => DEFAULT_ARCHETYPES,
	close: () => undefined,
};
