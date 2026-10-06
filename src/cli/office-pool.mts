// office-pool: look at the office pool table (read-only).
//   office-pool state [--json]
// Idle agents play 8-ball automatically with the app's built-in AI; nobody
// shoots from here. Runs under plain Node (type stripping), so it uses only
// Node built-ins; `state` prints the digest the app keeps up to date
// (`PoolView` in src/shared/pool.ts).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

type Env = Readonly<Record<string, string | undefined>>;

/** Where the app keeps the table for `office-pool state`. */
export function poolDigestPath(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder", "pool.json");
}

const USAGE = `usage:
  office-pool state [--json]   the table: game, sides, groups, balls, shooter, last shots
`;

interface Ball {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	readonly pocket: string | null;
}

interface Side {
	readonly players: readonly string[];
	readonly group: string | null;
	readonly left: readonly number[];
}

/** The fields this CLI prints; the app writes the whole `PoolView`. */
interface Digest {
	readonly stage: string;
	readonly mode: string | null;
	readonly balls: readonly Ball[];
	readonly sides: readonly Side[];
	readonly shooter: string | null;
	readonly ballInHand: string | null;
	readonly onEight: boolean;
	readonly shot: number;
	readonly queue: readonly string[];
	readonly recent: readonly { readonly text: string }[];
	readonly result: { readonly players: readonly string[]; readonly reason: string } | null;
	readonly label: string;
}

function fail(message: string, code = 2): number {
	process.stderr.write(`office-pool: ${message}\n`);
	return code;
}

function isDigest(value: unknown): value is Digest {
	return (
		typeof value === "object" &&
		value !== null &&
		"stage" in value &&
		typeof value.stage === "string" &&
		"balls" in value &&
		Array.isArray(value.balls) &&
		"sides" in value &&
		Array.isArray(value.sides)
	);
}

const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;

function ballLine(ball: Ball): string {
	const name =
		ball.id === 0
			? "cue"
			: ball.id === 8
				? "8 (black)"
				: ball.id < 8
					? `${ball.id} (solid)`
					: `${ball.id} (stripe)`;
	return `  ${name.padEnd(12)} x ${signed(ball.x)}  y ${signed(ball.y)}`;
}

function sideLine(side: Side, index: number): string {
	const group = side.group
		? `${side.group}, ${side.left.length} left (${side.left.join(" ")})`
		: "open table";
	return `  ${index + 1}. ${side.players.join(" + ") || "(empty)"}: ${group}`;
}

function status(digest: Digest): string[] {
	if (digest.stage === "resting") return ["The table is resting: nobody is playing."];
	if (digest.stage === "finished") {
		const winner = digest.result?.players.length
			? `${digest.result.players.join(" + ")} won`
			: "Draw";
		return [`Game over: ${winner} (${digest.result?.reason ?? "?"}). Teams re-form in a moment.`];
	}
	const hand = digest.ballInHand ? `, ball in hand (${digest.ballInHand})` : "";
	const eight = digest.onEight ? ", on the 8 (calls a pocket)" : "";
	return [
		`${digest.mode === "practice" ? "Practice" : "8-ball"}, shot ${digest.shot}: ${digest.shooter ?? "?"} to shoot${hand}${eight}.`,
	];
}

/** One screen a model can read: who plays, groups, every ball still up, the last shots. */
export function describe(digest: Digest): string {
	const onTable = digest.balls.filter((ball) => ball.pocket === null);
	const lines = [
		`Pool table${digest.label ? `: ${digest.label}` : ""}`,
		...status(digest),
		...(digest.sides.length > 0 ? ["Sides:", ...digest.sides.map(sideLine)] : []),
		...(digest.queue.length > 0 ? [`Waiting: ${digest.queue.join(", ")}`] : []),
		"Balls on the table (metres from the centre; +x toward the foot rail, table 2.24 x 1.12):",
		...onTable.map(ballLine),
		...(digest.recent.length > 0
			? ["Last shots:", ...digest.recent.map((shot) => `  ${shot.text}`)]
			: []),
	];
	return `${lines.join("\n")}\n`;
}

function state(argv: readonly string[]): number {
	const { values } = parseArgs({ args: [...argv], options: { json: { type: "boolean" } } });
	let text: string;
	try {
		text = readFileSync(poolDigestPath(process.env, homedir()), "utf8");
	} catch {
		process.stdout.write("No pool table yet (Dunder has not written it).\n");
		return 0;
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	if (!isDigest(json)) return fail("the pool digest is unreadable", 1);
	process.stdout.write(values.json ? `${JSON.stringify(json, null, 2)}\n` : describe(json));
	return 0;
}

function main(argv: readonly string[]): number {
	const [command, ...rest] = argv;
	if (command === "state") return state(rest);
	const help = command === "-h" || command === "--help";
	process[help ? "stdout" : "stderr"].write(USAGE);
	return help ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		// parseArgs rejects unknown flags.
		process.exitCode = fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
	}
}
