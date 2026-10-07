// office-plan: the chief of staff proposes today's plan and closes the day; anyone reads both.
//   office-plan propose < plan.json     {"focus": "…", "items": [{"bead", "who", "why"}], "notToday": ["…"]}
//   office-plan wrap < wrap.json        {"summary": "…", "misses": [{"bead", "why"}], "tomorrow": [{"bead"?, "what"}]}
//   office-plan show [--json]
// Runs under plain Node (type stripping), so it uses only Node built-ins. The app
// validates against `planProposalSchema` (src/shared/plan.ts) and `wrapInputSchema`
// (src/shared/wrap.ts), honours only the chief of staff's pane, answers in the
// results file, and keeps today's plan and wrap-up in the digests `show` prints.
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
  office-plan wrap < wrap.json
      {"summary": "<≤200>", "misses": [{"bead": "office-abc", "why": "<≤120>"}] (≤5),
       "tomorrow": [{"bead": "office-def" (optional), "what": "<≤120>"}] (1-3)}
  office-plan show [--json]   (--json: the plan only)
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

/** Today's wrap-up, kept by the app for `office-plan show`. */
export function wrapDigestPath(env: Env, home: string): string {
	return join(stateDir(env, home), "wrap.json");
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

/** The results file and its rotated generation (`<path>.1`; the app rotates it past 256 KB). */
function readResults(path: string): string {
	const read = (file: string): string => {
		try {
			return readFileSync(file, "utf8");
		} catch {
			return "";
		}
	};
	return `${read(path)}\n${read(`${path}.1`)}`;
}

function findResult(path: string, id: string): { ok: boolean; message: string } | undefined {
	const text = readResults(path);
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

/** Send stdin's JSON as a `propose` or `wrap` request and print the app's answer. */
async function send(op: "propose" | "wrap"): Promise<number> {
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		return fail(
			"HERDR_PANE_ID is not set, so the office cannot tell who is asking. Run office-plan from your bash tool in your office pane.",
		);
	}
	let body: unknown;
	try {
		body = JSON.parse(readFileSync(0, "utf8"));
	} catch (error) {
		const what = op === "propose" ? "the plan" : "the wrap-up";
		return fail(
			`${what} on stdin is not JSON (${error instanceof Error ? error.message : String(error)})\n${USAGE}`,
		);
	}
	const id = randomUUID();
	const path = planRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	const field = op === "propose" ? "plan" : "wrap";
	const line = { v: 1, id, fromPane, requestedAt: new Date().toISOString(), op, [field]: body };
	// One O_APPEND write per request, so concurrent requesters never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
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

/** A digest's `field` when the digest is today's (null: none today), or undefined when there's no digest. */
function readToday(path: string, field: string): Record<string, unknown> | null | undefined {
	let digest: unknown;
	try {
		digest = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
	if (!isObject(digest) || digest["date"] !== today()) return null;
	const value = digest[field];
	return isObject(value) ? value : null;
}

const lines = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? value.filter(isObject) : [];

/** The wrap-up as text: summary, the plan's items with their lanes, why-nots, unplanned, spend, tomorrow. */
function describeWrap(wrap: Record<string, unknown>): string {
	const input = isObject(wrap["input"]) ? wrap["input"] : {};
	const spend =
		typeof wrap["spendUsd"] === "number" ? `~$${wrap["spendUsd"].toFixed(2)}` : "unknown";
	const unplanned = lines(wrap["unplanned"]).map((bead) => String(bead["id"]));
	return [
		`Day's end: ${String(input["summary"] ?? "")}`,
		...lines(wrap["planned"]).map(
			(item) =>
				`- ${String(item["bead"])} · ${String(item["who"])}: ${String(item["lane"] ?? "not on the board")}`,
		),
		...lines(input["misses"]).map(
			(miss) => `  why not ${String(miss["bead"])}: ${String(miss["why"])}`,
		),
		`Shipped outside the plan: ${unplanned.length > 0 ? unplanned.join(", ") : "nothing"}`,
		`AI spend today: ${spend}`,
		"Tomorrow:",
		...lines(input["tomorrow"]).map(
			(item, index) =>
				`${index + 1}. ${item["bead"] ? `${String(item["bead"])}: ` : ""}${String(item["what"])}`,
		),
	].join("\n");
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
	const plan = readToday(planDigestPath(process.env, homedir()), "plan");
	if (plan === undefined)
		return fail("Dunder has not written a plan digest yet (is the app running?)");
	if (json) {
		process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
		return 0;
	}
	process.stdout.write(plan ? `${describe(plan)}\n` : "No plan today.\n");
	const wrap = readToday(wrapDigestPath(process.env, homedir()), "wrap");
	if (wrap) process.stdout.write(`\n${describeWrap(wrap)}\n`);
	return 0;
}

async function main(argv: readonly string[]): Promise<number> {
	const [command, ...rest] = argv;
	if ((command === "propose" || command === "wrap") && rest.length === 0) return send(command);
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
