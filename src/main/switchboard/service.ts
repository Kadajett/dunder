import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { type MailLine, mailLineSchema, type OfficeMessage } from "@shared/switchboard";
import type { HerdrApi } from "../herdr/api-client";
import { Switchboard } from "./switchboard";

/**
 * Must match `mailboxPath` in src/cli/office-say.mts, which cannot import app
 * code (it runs under plain Node); switchboard.test.ts keeps the two in step.
 */
export function officeMailboxPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	const state = env["XDG_STATE_HOME"] || join(home, ".local", "state");
	return join(state, "dunder", "mailbox.ndjson");
}

/**
 * Send an agent an office message from the app itself (no pane, so it reads
 * "from someone"): one mailbox line, delivered by the switchboard once the
 * agent is free, exactly like `office-say`.
 */
export async function postToMailbox(to: string, text: string): Promise<void> {
	const line: MailLine = mailLineSchema.parse({
		v: 1,
		id: randomUUID(),
		to,
		text,
		sentAt: new Date().toISOString(),
	});
	const path = officeMailboxPath(process.env, homedir());
	await mkdir(dirname(path), { recursive: true });
	await appendFile(path, `${JSON.stringify(line)}\n`);
}

export interface SwitchboardService {
	start(api: HerdrApi): Promise<void>;
	update(snapshot: SessionSnapshot): void;
	recent(): readonly OfficeMessage[];
	stop(): void;
}

/** The app's switchboard: created at startup, started once the office server answers. */
export function createSwitchboardService(
	userData: string,
	emit: (message: OfficeMessage) => void,
): SwitchboardService {
	let board: Switchboard | undefined;
	let latest: SessionSnapshot | undefined;
	return {
		async start(api) {
			board = new Switchboard({
				api,
				mailboxPath: officeMailboxPath(process.env, homedir()),
				statePath: join(userData, "switchboard.json"),
				emit,
			});
			if (latest) board.updateSnapshot(latest);
			await board.start();
		},
		update(snapshot) {
			latest = snapshot;
			board?.updateSnapshot(snapshot);
		},
		recent: () => board?.recent() ?? [],
		stop: () => board?.stop(),
	};
}
