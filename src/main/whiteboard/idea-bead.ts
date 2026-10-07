import type { MakeIdeaRequest } from "@shared/whiteboard";
import type { BdRunner } from "../beads/bd";

function beadId(output: string): string {
	const id = output.match(/\b[a-z][a-z0-9]*-[a-z0-9]+\b/i)?.[0];
	if (!id) throw new Error("bd created an idea without returning its id");
	return id;
}

/** Create one P3 task; the title is concise while the full note stays in its description. */
export async function createIdeaBead(
	runBd: BdRunner,
	cwd: string,
	request: MakeIdeaRequest,
): Promise<string> {
	const { text, author } = request;
	const title = text.split(/\r?\n/, 1)[0]?.trim().slice(0, 120) || "Whiteboard idea";
	const description = `Who: ${author}\n\nIdea from the whiteboard:\n${text}`;
	const output = await runBd(
		[
			"create",
			`--title=idea: ${title}`,
			"--type=task",
			"--priority=3",
			"--silent",
			`--description=${description}`,
		],
		cwd,
	);
	return beadId(output);
}
