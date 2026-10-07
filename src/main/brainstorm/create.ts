import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Brainstorm } from "@shared/brainstorm";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { officeArgs, runHerdr } from "../herdr/cli";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import { readSavedOffset } from "../switchboard/offset-file";
import { officeBoardDigestPath } from "../whiteboard/requests";
import { BrainstormService } from "./service";

const log = createLogger("brainstorm");
const PROMPT_TIMEOUT_MS = 20_000;
const digestSchema = z.object({
	items: z.array(z.object({ kind: z.string(), author: z.string(), text: z.string() })),
});

/**
 * Must match `brainstormRequestsPath` in src/cli/office-brainstorm.mts, which
 * cannot import app code (it runs under plain Node); the CLI test keeps them in step.
 */
export function officeBrainstormRequestsPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	return join(
		env["XDG_STATE_HOME"] || join(home, ".local", "state"),
		"dunder",
		"brainstorm-requests.ndjson",
	);
}

/** The board as the invitation quotes it, from the digest the whiteboard keeps for `office-board read`. */
async function boardText(): Promise<string> {
	try {
		const digest = digestSchema.parse(
			JSON.parse(await readFile(officeBoardDigestPath(process.env, homedir()), "utf8")),
		);
		return digest.items
			.map((item) => `- ${item.author}: ${item.text.replaceAll("\n", " ")}`)
			.join("\n");
	} catch {
		return "";
	}
}

export interface BrainstormOptions {
	readonly userData: string;
	readonly chiefName: () => string | undefined;
	readonly emit: (brainstorm: Brainstorm | null) => void;
}

export interface BrainstormWiring {
	readonly service: BrainstormService;
	/** Follow `office-brainstorm` requests from where the last run left off. */
	start(): Promise<void>;
	stop(): void;
}

/** The brainstorm wired to herdr prompts, the board digest and the `office-brainstorm` requests file. */
export function createBrainstorm(options: BrainstormOptions): BrainstormWiring {
	const service = new BrainstormService({
		emit: options.emit,
		chiefName: options.chiefName,
		prompt: async (agent, text) => {
			await runHerdr(officeArgs(["agent", "prompt", agent, text]), PROMPT_TIMEOUT_MS);
		},
		boardText,
		sleep: (ms) => delay(ms),
		now: Date.now,
	});
	const statePath = join(options.userData, "brainstorm-requests.json");
	let tail: MailboxTail | undefined;
	return {
		service,
		async start() {
			// A lost place reads from the top; requests older than REQUEST_MAX_AGE_MS are dropped.
			const offset = (await readSavedOffset(statePath)) ?? 0;
			tail = await tailMailbox({
				path: officeBrainstormRequestsPath(process.env, homedir()),
				offset,
				onLines: (lines, next) => {
					writeFile(statePath, JSON.stringify({ offset: next })).catch((error: unknown) =>
						log.warn("cannot save the brainstorm requests offset", { error }),
					);
					service.receive(lines);
				},
				onError: (error) => log.warn("cannot read brainstorm requests", { error }),
			});
		},
		stop() {
			tail?.stop();
		},
	};
}
