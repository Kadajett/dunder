import { parseArgs } from "node:util";
import { type ArchetypeId, parseArchetypePicks } from "./archetypes.js";

export interface Options {
	readonly command: "setup" | "help" | "version";
	/** Accept every default and consent without asking. */
	readonly yes: boolean;
	/** Print the plan and change nothing. */
	readonly dryRun: boolean;
	/** Undefined: ask (or, with `--yes`, skip). */
	readonly engineering?: boolean;
	/** Undefined: ask (or, with `--yes`, the defaults). */
	readonly archetypes?: readonly ArchetypeId[];
}

export type ParsedOptions =
	| { readonly ok: true; readonly options: Options }
	| { readonly ok: false; readonly error: string };

export const USAGE = `Usage: npx dunder-ai [setup] [options]

Installs Dunder (a 3D office where your AI coding agents work) and what it
needs: herdr, omp and bd. Linux x64.

Options:
  -y, --yes                Accept every default and install without asking
      --dry-run            Print every action and change nothing
      --with-engineering   Also install Jeremy's engineering toolkit
      --no-engineering     Do not offer the engineering toolkit
      --archetypes a,b,c   Starting agents: generalist, frontend, backend,
                           reviewer, researcher, ops, chief-of-staff (or none)
  -h, --help               Show this help
  -v, --version            Print the installer version
`;

const COMMANDS = ["setup", "help", "version"] as const;

export function parseOptions(argv: readonly string[]): ParsedOptions {
	let parsed: ParsedFlags;
	try {
		parsed = readFlags(argv);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
	const { flags, positionals } = parsed;
	const [name = "setup", ...extra] = positionals;
	const command = COMMANDS.find((entry) => entry === name);
	if (!command) return { ok: false, error: `unknown command "${name}"` };
	if (extra.length > 0) return { ok: false, error: `unexpected argument "${extra[0]}"` };
	return toOptions(flags, flags.help ? "help" : flags.version ? "version" : command);
}

function toOptions(flags: ParsedFlags["flags"], command: Options["command"]): ParsedOptions {
	if (flags["with-engineering"] && flags["no-engineering"]) {
		return { ok: false, error: "--with-engineering and --no-engineering contradict each other" };
	}
	const base = { command, yes: flags.yes, dryRun: flags["dry-run"] };
	const engineering = flags["with-engineering"] || (flags["no-engineering"] ? false : undefined);
	const withEngineering = engineering === undefined ? base : { ...base, engineering };
	if (flags.archetypes === undefined) return { ok: true, options: withEngineering };
	const picks = parseArchetypePicks(flags.archetypes === "" ? "none" : flags.archetypes);
	if (!picks.ok) return { ok: false, error: `--archetypes: ${picks.error}` };
	return { ok: true, options: { ...withEngineering, archetypes: picks.ids } };
}

interface ParsedFlags {
	readonly flags: {
		readonly yes: boolean;
		readonly "dry-run": boolean;
		readonly "with-engineering": boolean;
		readonly "no-engineering": boolean;
		readonly archetypes?: string;
		readonly help: boolean;
		readonly version: boolean;
	};
	readonly positionals: readonly string[];
}

function readFlags(argv: readonly string[]): ParsedFlags {
	const { values, positionals } = parseArgs({
		args: [...argv],
		allowPositionals: true,
		strict: true,
		options: {
			yes: { type: "boolean", short: "y", default: false },
			"dry-run": { type: "boolean", default: false },
			"with-engineering": { type: "boolean", default: false },
			"no-engineering": { type: "boolean", default: false },
			archetypes: { type: "string" },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});
	return { flags: values, positionals };
}
