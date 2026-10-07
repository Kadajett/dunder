// office-plan: the chief of staff proposes today's plan, and anyone reads it.
//   office-plan propose < plan.json     {"focus": "…", "items": [{"bead", "who", "why"}], "notToday": ["…"]}
//   office-plan show [--json]
// Runs under plain Node (type stripping), so it uses only Node built-ins. The app
// validates the plan against `planProposalSchema` (src/shared/plan.ts), honours
// only the chief of staff's pane, answers in the results file, and keeps today's
// plan in the digest that `show` prints.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

type Env = Readonly<Record<string, string | undefined>>;

const USAGE = `usage:
  office-plan propose < plan.json
      {"focus": "<one sentence, ≤140>", "items": [{"bead": "office-abc", "who": "carl", "why": "<≤120>"}] (≤5),
       "notToday": ["<≤80>"] (≤5)}
  office-plan show [--json]
`;
const DEFAULT_WAIT_MS = 30_000;
const POLL_MS = 250;

function stateDir(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/** Where `office-plan propose` drops requests for the app. */
export function planRequestsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan-requests.ndjson");
}

/** Where the app answers them, one line per request id. */
export function planResultsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan-results.ndjson");
}

/** Today's plan, kept by the app for `office-plan show`. */
export function planDigestPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan.json");
}

/** Local `YYYY-MM-DD`, as the app keys its days. */
function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fail(message: string, code = 1): number {
	process.stderr.write(`office-plan: ${message}\n`);
	return code;
}

function findResult(path: string, id: string): { ok: boolean; message: string } | undefined {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
	for (const line of text.split("\n")) {
		if (!line.includes(id)) continue;
		try {
			const result: unknown = JSON.parse(line);
			if (typeof result !== "object" || result === null || !("id" in result) || result.id !== id)
				continue;
			const ok = "ok" in result && result.ok === true;
			const message =
				"message" in result && typeof result.message === "string" ? result.message : "";
			return { ok, message };
		} catch {
			// A line the app is still writing; the next poll reads it whole.
		}
	}
	return undefined;
}

async function awaitResult(id: string, waitMs: number): Promise<number> {
	const path = planResultsPath(process.env, homedir());
	for (let waited = 0; waited <= waitMs; waited += POLL_MS) {
		const result = findResult(path, id);
		if (result) {
			(result.ok ? process.stdout : process.stderr).write(`office-plan: ${result.message}\n`);
			return result.ok ? 0 : 1;
		}
		await sleep(POLL_MS);
	}
	return fail("proposed, but Dunder has not answered yet (is the app running?)");
}

async function propose(): Promise<number> {
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		return fail(
			"HERDR_PANE_ID is not set, so the office cannot tell who is proposing. Run office-plan from your bash tool in your office pane.",
		);
	}
	let plan: unknown;
	try {
		plan = JSON.parse(readFileSync(0, "utf8"));
	} catch (error) {
		return fail(
			`the plan on stdin is not JSON (${error instanceof Error ? error.message : String(error)})\n${USAGE}`,
		);
	}
	const id = randomUUID();
	const path = planRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One O_APPEND write per request, so concurrent requesters never interleave.
	appendFileSync(
		path,
		`${JSON.stringify({ v: 1, id, fromPane, requestedAt: new Date().toISOString(), op: "propose", plan })}\n`,
	);
	const wait = Number(process.env["OFFICE_PLAN_WAIT_MS"] ?? DEFAULT_WAIT_MS);
	return awaitResult(id, Number.isFinite(wait) ? wait : DEFAULT_WAIT_MS);
}

interface Proposal {
	readonly focus: string;
	readonly items: readonly { readonly bead: string; readonly who: string; readonly why: string }[];
	readonly notToday: readonly string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

function isProposal(value: unknown): value is Proposal {
	return (
		isObject(value) &&
		typeof value["focus"] === "string" &&
		Array.isArray(value["items"]) &&
		value["items"].every((item) => isObject(item) && typeof item["bead"] === "string") &&
		Array.isArray(value["notToday"])
	);
}

/** The digest's plan when it is today's (null: no plan today), or undefined when there's no digest. */
function readPlan(): Record<string, unknown> | null | undefined {
	let digest: unknown;
	try {
		digest = JSON.parse(readFileSync(planDigestPath(process.env, homedir()), "utf8"));
	} catch {
		return undefined;
	}
	if (!isObject(digest) || digest["date"] !== today()) return null;
	const plan = digest["plan"];
	return isObject(plan) ? plan : null;
}

function describe(plan: Record<string, unknown>): string {
	const effect = isProposal(plan["edited"]) ? plan["edited"] : plan["proposal"];
	if (!isProposal(effect)) return "Today's plan is unreadable.";
	const goAheadAt = plan["goAheadAt"];
	const goAhead =
		typeof goAheadAt === "number" ? new Date(goAheadAt).toTimeString().slice(0, 5) : null;
	const state = String(plan["state"]);
	return [
		`Today's plan: ${state === "proposed" && goAhead ? `proposed (Max goes ahead at ${goAhead})` : state}`,
		`Focus: ${effect.focus}`,
		...effect.items.map((item, index) => `${index + 1}. ${item.bead} · ${item.who}: ${item.why}`),
		...(effect.notToday.length > 0
			? ["Not today:", ...effect.notToday.map((text) => `- ${text}`)]
			: []),
	].join("\n");
}

function show(json: boolean): number {
	const plan = readPlan();
	if (plan === undefined)
		return fail("Dunder has not written a plan digest yet (is the app running?)");
	if (json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
	else process.stdout.write(plan ? `${describe(plan)}\n` : "No plan today.\n");
	return 0;
}

async function main(argv: readonly string[]): Promise<number> {
	const [command, ...rest] = argv;
	if (command === "propose" && rest.length === 0) return propose();
	if (command === "show" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--json"))) {
		return show(rest[0] === "--json");
	}
	const help = command === "-h" || command === "--help";
	process[help ? "stdout" : "stderr"].write(USAGE);
	return help ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await main(process.argv.slice(2));
}
