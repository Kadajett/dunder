import { appendFile, readFile, writeFile } from "node:fs/promises";
import { avatarStyleFor } from "@shared/avatar/style";
import { CHIEF_ROLE } from "@shared/chief";
import type { Roster } from "@shared/company/roster";
import { activeAgents, findByName } from "@shared/company/roster-ops";
import type { WorkforceResult } from "@shared/company/workforce";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import type { SetModelResult } from "@shared/models";
import type { StaffAction, StaffOutcome, StaffRequestLine, StaffResultLine } from "@shared/staff";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import { parseStaffRequests } from "./requests";
import { rosterTable } from "./roster-table";

const log = createLogger("staff-desk");
const stateSchema = z.object({ offset: z.number().int().nonnegative() });

type Hire = Extract<StaffAction, { action: "hire" }>;

export interface StaffDeskDeps {
	/** The renderer's hire/fire/restart path (validation, pane handling, respawn). */
	readonly staffing: {
		hire(request: unknown): Promise<WorkforceResult>;
		fire(name: string): Promise<WorkforceResult>;
		restart(name: string): Promise<WorkforceResult>;
	};
	setModel(name: string, selector: string, thinking: string | undefined): Promise<SetModelResult>;
	roster(): Roster | undefined;
	/** The model a live worker runs now, when known. */
	modelOf(name: string): string | undefined;
	/** Store a hire's extra brief where the workforce reads it at spawn. */
	writeBrief(name: string, brief: string): Promise<void>;
	/** Room and project directory for hires that do not name them. */
	readonly defaults: { readonly room: string; readonly cwd: string };
	readonly requestsPath: string;
	readonly resultsPath: string;
	readonly statePath: string;
	emit(outcome: StaffOutcome): void;
	now?(): number;
}

interface Answer {
	readonly ok: boolean;
	readonly message: string;
}

const done = (result: WorkforceResult, message: string): Answer =>
	result.ok ? { ok: true, message } : { ok: false, message: result.error };

/** `selector[:thinking]` → its parts; the model service validates both against the catalog. */
function splitModel(spec: string): { selector: string; thinking: string | undefined } {
	const split = spec.lastIndexOf(":");
	return split === -1
		? { selector: spec, thinking: undefined }
		: { selector: spec.slice(0, split), thinking: spec.slice(split + 1) };
}

/**
 * Applies `office-staff` requests: tails the requests file, honours only the chief
 * of staff's pane, applies each request through staffing / the model service, and
 * answers in the results file (for the CLI) and the Activity Feed.
 */
export class StaffDesk {
	readonly #deps: StaffDeskDeps;
	#snapshot: SessionSnapshot | undefined;
	/** Lines read before the office (snapshot + roster) was known: the chief's pane comes from it. */
	#early: string[] = [];
	/** Requests run one at a time, in the order they were written. */
	#work: Promise<void> = Promise.resolve();
	#tail: MailboxTail | undefined;

	constructor(deps: StaffDeskDeps) {
		this.#deps = deps;
	}

	async start(): Promise<void> {
		const { requestsPath, statePath } = this.#deps;
		const offset = await readFile(statePath, "utf8").then(
			(text) => stateSchema.safeParse(JSON.parse(text)).data?.offset ?? 0,
			() => 0,
		);
		this.#tail = await tailMailbox({
			path: requestsPath,
			offset,
			onLines: (lines, next) => {
				// Persist first: a hire must not replay on the next start.
				void writeFile(statePath, JSON.stringify({ offset: next }));
				this.receive(lines);
			},
			onError: (error) => log.warn("cannot read staff requests", { error }),
		});
	}

	stop(): void {
		this.#tail?.stop();
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		if (this.#early.length === 0 || !this.#deps.roster()) return;
		const early = this.#early;
		this.#early = [];
		log.info("handling staff requests read before the office was known", { lines: early.length });
		this.receive(early);
	}

	/** New lines from the requests file; queued behind any request still running. */
	receive(lines: readonly string[]): void {
		if (!this.#snapshot || !this.#deps.roster()) {
			this.#early.push(...lines);
			return;
		}
		const { requests, invalid } = parseStaffRequests(lines, this.#now());
		for (const { id, error } of invalid) void this.#answer(id, { ok: false, message: error });
		for (const line of requests) {
			this.#work = this.#work.then(() => this.#handle(line));
		}
	}

	/** Resolves once every request received so far has been handled. */
	settled(): Promise<void> {
		return this.#work;
	}

	async #handle(line: StaffRequestLine): Promise<void> {
		const { request, fromPane, id } = line;
		const by = this.#snapshot?.agents.find((agent) => agent.pane_id === fromPane)?.name ?? fromPane;
		const chief = this.#chief();
		const answer =
			chief && chief.pane === fromPane
				? await this.#apply(request, chief.name).catch(
						(error: unknown): Answer => ({ ok: false, message: String(error) }),
					)
				: this.#refuse(line, by, chief?.name);
		await this.#answer(id, answer);
		const name = "name" in request ? request.name : undefined;
		if (request.action !== "list" || !answer.ok) {
			log.info("staff request handled", { by, action: request.action, name, ok: answer.ok });
		}
		this.#deps.emit({ id, by, action: request.action, ...(name && { name }), ...answer });
	}

	#refuse(line: StaffRequestLine, by: string, chief: string | undefined): Answer {
		log.warn("refused a staff request from a pane that is not the chief of staff's", {
			fromPane: line.fromPane,
			by,
			action: line.request.action,
		});
		const who = chief ? `the chief of staff (${chief})` : "the chief of staff";
		return { ok: false, message: `only ${who} can change the staff; nothing was done` };
	}

	/** The chief of staff's name and live pane, from the roster and the latest snapshot. */
	#chief(): { name: string; pane: string } | undefined {
		const roster = this.#deps.roster();
		const name = roster && activeAgents(roster).find((agent) => agent.role === CHIEF_ROLE)?.name;
		const pane = this.#snapshot?.agents.find((agent) => agent.name === name)?.pane_id;
		return name && pane ? { name, pane } : undefined;
	}

	async #apply(request: StaffAction, chief: string): Promise<Answer> {
		const { staffing } = this.#deps;
		switch (request.action) {
			case "hire":
				return this.#hire(request);
			case "fire":
				if (request.name === chief)
					return { ok: false, message: "the chief of staff cannot fire themself" };
				return done(
					await staffing.fire(request.name),
					`${request.name} is let go; their pane is closed`,
				);
			case "restart":
				if (request.name === chief) {
					return { ok: false, message: "you cannot restart yourself mid-turn; ask Jeremy" };
				}
				return done(await staffing.restart(request.name), `${request.name} is restarting`);
			case "model":
				return this.#model(request.name, request.model);
			case "list":
				return { ok: true, message: `the roster:\n${this.#list()}` };
		}
	}

	async #hire(request: Hire): Promise<Answer> {
		const { name, role, model, brief } = request;
		// Names are never reused: never overwrite the brief of someone already on the roster.
		const roster = this.#deps.roster();
		if (brief && roster && !findByName(roster, name)) await this.#deps.writeBrief(name, brief);
		const room = request.room ?? this.#deps.defaults.room;
		const result = await this.#deps.staffing.hire({
			name,
			role,
			harness: request.harness ?? "omp",
			...(model && { model }),
			workspaceLabel: room,
			cwd: request.cwd ?? this.#deps.defaults.cwd,
			style: avatarStyleFor(name),
		});
		return done(
			result,
			`hired ${name} as ${role}${model ? ` on ${model}` : ""} in the ${room} room; starting now`,
		);
	}

	async #model(name: string, spec: string): Promise<Answer> {
		const { selector, thinking } = splitModel(spec);
		const result = await this.#deps.setModel(name, selector, thinking);
		switch (result.state) {
			case "applied":
				return { ok: true, message: `${name} now runs ${spec}` };
			case "queued":
				return { ok: true, message: `${name} switches to ${spec} when free (${result.reason})` };
			case "rejected":
				return { ok: false, message: result.reason };
		}
	}

	#list(): string {
		const roster = this.#deps.roster();
		const snapshot = this.#snapshot;
		if (!roster || !snapshot) return "the workforce is still starting";
		return rosterTable({ roster, snapshot, modelOf: (name) => this.#deps.modelOf(name) });
	}

	async #answer(id: string, answer: Answer): Promise<void> {
		const line: StaffResultLine = { v: 1, id, ...answer };
		await appendFile(this.#deps.resultsPath, `${JSON.stringify(line)}\n`).catch((error: unknown) =>
			log.warn("cannot write a staff result", { id, error }),
		);
	}

	#now(): number {
		return this.#deps.now?.() ?? Date.now();
	}
}
