// office-notes: draft public release notes from the beads merged since the last release.
//   office-notes draft [--since <git ref>] [--out <file>|-]
// Read-only: runs git log/describe/config and `bd show --json`, writes one markdown
// file (docs/release-notes/next.md by default), and never commits, pushes or
// publishes. A person edits the draft and puts it on the release by hand.
// Runs under plain Node (type stripping), so it uses only Node built-ins.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const USAGE = `usage:
  office-notes draft [--since <git ref>] [--out <file>|-]
      Drafts user-facing notes for everything merged since --since (default: the last v* tag)
      into docs/release-notes/next.md (or <file>, or stdout with -). Nothing is published.
`;

/** Matches `beadsOfCommits` in src/main/whats-new/card.ts (office-notes.test.ts keeps them in step). */
const BEAD_ID = String.raw`[a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)*`;
const BEAD_COMMIT = new RegExp(`^(${BEAD_ID}): `, "i");
const BEAD_MERGE = new RegExp(`^Merge bead/(${BEAD_ID})(?![\\w.-])`, "i");
const TRY_IT = /^\s*try it:\s*(.*\S)\s*$/i;

/** Bead ids named by commit subjects, newest first, each once; and how many commits named none. */
export function beadIdsOf(subjects: readonly string[]): { ids: string[]; unnamed: number } {
	const ids = new Set<string>();
	let unnamed = 0;
	for (const subject of subjects) {
		const id = (BEAD_COMMIT.exec(subject)?.[1] ?? BEAD_MERGE.exec(subject)?.[1])?.toLowerCase();
		if (id) ids.add(id);
		else if (!/^Merge (?:remote-tracking )?branch /.test(subject)) unnamed += 1;
	}
	return { ids: [...ids], unnamed };
}

export interface Bead {
	readonly id: string;
	readonly title: string;
	readonly type: string;
	readonly notes: string;
}

/** Who and what the internal text may name: agents (fired ones too), the chief, the owner, bead id prefixes. */
export interface Names {
	readonly agents: readonly string[];
	readonly chief: string | null;
	readonly owner: string | null;
	/** e.g. `office` for `office-pab`. */
	readonly idPrefixes: readonly string[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const word = (name: string, suffix = ""): RegExp =>
	new RegExp(String.raw`\b${escapeRegExp(name)}${suffix}\b`, "gi");

/** Rewrite one internal line for outsiders; `replaced` collects what was swapped, for the review list. */
export function publicText(text: string, names: Names, replaced: Set<string>): string {
	const ids = names.idPrefixes.map(escapeRegExp).join("|");
	let out = text
		.replace(/^\s*(?:idea|epic):\s*/i, "")
		.replace(/^[\w ]*audit #\d+:\s*/i, "")
		.replace(
			ids ? new RegExp(String.raw`\(?\b(?:${ids})-[a-z0-9]+(?:\.[0-9]+)*\b\)?`, "gi") : /$^/,
			"",
		)
		.replace(/`[^`]*\/[^`]*`/g, "")
		.replace(/(?:~|\b[\w.-]+)\/[\w./-]*\.\w+\b/g, "");
	const swaps: [string | null, string, string][] = [
		[names.owner, "your", "you"],
		[names.chief, "your chief of staff's", "your chief of staff"],
		...names.agents.map((name): [string, string, string] => [name, "an agent's", "an agent"]),
	];
	for (const [name, possessive, plain] of swaps) {
		if (!name || !word(name).test(out)) continue;
		replaced.add(`${name} → "${plain}"`);
		out = out.replace(word(name, "'s"), possessive).replace(word(name), plain);
	}
	out = out
		.replace(/\(\s*\)/g, "")
		.replace(/\s+([,.;:)])/g, "$1")
		.replace(/\s{2,}/g, " ")
		.trim();
	return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The last `Try it:` line of a bead's notes, like the What's new card. */
export function tryItOf(notes: string): string | null {
	const lines = notes.split("\n");
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const match = TRY_IT.exec(lines[index] ?? "");
		if (match?.[1]) return match[1];
	}
	return null;
}

const SECTIONS = [
	["New", (type: string) => type === "feature"],
	["Fixed", (type: string) => type === "bug"],
	["Improved", (type: string) => type !== "feature" && type !== "bug"],
] as const;

/** A path the stripping missed (a home dir or the repo's own folders): internal, flagged for the human pass. */
const LEFTOVER_PATH = /~\/|\b(?:src|docs|scripts|bin)\//;

/** Why a bullet needs a human look, or null. */
function needsLook(original: string, line: string, owner: string | null): string | null {
	if (LEFTOVER_PATH.test(line)) return "looks internal";
	// "Jeremy is busy" became "you is busy": the swap can't fix the verb.
	if (owner && word(owner).test(original)) return "grammar after naming you";
	return null;
}

export interface DraftInput {
	readonly range: string;
	readonly beads: readonly Bead[];
	/** Ids the commits named that bd doesn't know. */
	readonly unknown: number;
	/** Commits that named no bead. */
	readonly unnamed: number;
	readonly names: Names;
	readonly today: string;
}

/** The markdown draft: a review checklist (HTML comment), then New / Fixed / Improved bullets. */
export function renderDraft(input: DraftInput): string {
	const replaced = new Set<string>();
	const flagged: string[] = [];
	const shipped = input.beads.filter((bead) => bead.type !== "epic");
	const bullet = (bead: Bead): string => {
		const title = publicText(bead.title, input.names, replaced).replace(/\.$/, "");
		const tryIt = tryItOf(bead.notes);
		const line = `- ${title}${tryIt ? `. Try it: ${publicText(tryIt, input.names, replaced)}` : ""}`;
		const why = needsLook(`${bead.title} ${tryIt ?? ""}`, line, input.names.owner);
		if (why) flagged.push(`- Check (${why}): ${line.slice(2)}`);
		return line;
	};
	const sections = SECTIONS.flatMap(([heading, matches]) => {
		const lines = shipped.filter((bead) => matches(bead.type)).map(bullet);
		return lines.length > 0 ? [`### ${heading}`, "", ...lines, ""] : [];
	});
	const leftOut = [
		`${input.beads.length - shipped.length} epic(s)`,
		`${input.unknown} bead(s) bd doesn't know`,
		`${input.unnamed} commit(s) without a bead`,
	];
	return [
		"<!--",
		`DRAFT release notes for ${input.range}, generated by office-notes on ${input.today}. Nothing was published.`,
		"Before using it: read every line as an outsider would, merge or drop the small ones,",
		"then paste it into the GitHub release by hand.",
		...(replaced.size > 0 ? [`- Replaced: ${[...replaced].join(", ")}`] : []),
		...flagged,
		`- Left out: ${leftOut.join(", ")}`,
		"-->",
		"",
		"## What's new",
		"",
		...(sections.length > 0 ? sections : ["Nothing user-facing since the last release.", ""]),
	].join("\n");
}

const run = (command: string, args: readonly string[]): string =>
	execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Agent names and the chief's from Dunder's roster; none when there's no roster to read. */
function rosterNames(
	env: Readonly<Record<string, string | undefined>>,
): Pick<Names, "agents" | "chief"> {
	const path = join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "Dunder", "roster.json");
	try {
		const roster: unknown = JSON.parse(readFileSync(path, "utf8"));
		const agents =
			typeof roster === "object" &&
			roster !== null &&
			"agents" in roster &&
			Array.isArray(roster.agents)
				? roster.agents.filter(
						(agent): agent is { name: string; role?: string } => typeof agent?.name === "string",
					)
				: [];
		const chief = agents.find((agent) => agent.role === "chief-of-staff")?.name ?? null;
		return { agents: agents.map((agent) => agent.name).filter((name) => name !== chief), chief };
	} catch {
		return { agents: [], chief: null };
	}
}

function beadsOf(ids: readonly string[]): Bead[] {
	if (ids.length === 0) return [];
	const json: unknown = JSON.parse(run("bd", ["show", ...ids, "--json"]));
	if (!Array.isArray(json)) return [];
	return json.map((issue: Record<string, unknown>) => ({
		id: String(issue["id"]),
		title: String(issue["title"] ?? ""),
		type: String(issue["issue_type"] ?? "task"),
		notes: String(issue["notes"] ?? ""),
	}));
}

function draft(args: readonly string[]): number {
	const { values } = parseArgs({
		args: [...args],
		options: { since: { type: "string" }, out: { type: "string" } },
	});
	const since = values.since ?? run("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"]);
	const range = `${since}..HEAD`;
	const { ids, unnamed } = beadIdsOf(
		run("git", ["log", "--format=%s", range]).split("\n").filter(Boolean),
	);
	const beads = beadsOf(ids);
	const owner = run("git", ["config", "user.name"]).split(/\s+/)[0] || null;
	const text = renderDraft({
		range,
		beads,
		unknown: ids.length - beads.length,
		unnamed,
		names: {
			...rosterNames(process.env),
			owner,
			idPrefixes: [...new Set(ids.map((id) => id.split("-")[0] ?? id))],
		},
		today: new Date().toISOString().slice(0, 10),
	});
	if (values.out === "-") {
		process.stdout.write(text);
		return 0;
	}
	const out = resolve(
		values.out ??
			join(run("git", ["rev-parse", "--show-toplevel"]), "docs", "release-notes", "next.md"),
	);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, text);
	process.stdout.write(
		`office-notes: drafted ${beads.length} bead(s) since ${since} into ${out}. Edit it before it goes anywhere; nothing was published.\n`,
	);
	return 0;
}

function main(argv: readonly string[]): number {
	const [command, ...rest] = argv;
	if (command === "draft") {
		try {
			return draft(rest);
		} catch (error) {
			process.stderr.write(
				`office-notes: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
			);
			return 1;
		}
	}
	const help = command === "-h" || command === "--help";
	process[help ? "stdout" : "stderr"].write(USAGE);
	return help ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = main(process.argv.slice(2));
}
