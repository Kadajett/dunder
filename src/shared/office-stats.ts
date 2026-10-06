import type { Unsubscribe } from "./screens";

/** Today's AI spend: every office agent's omp session log, summed in main. */
export type CostToday =
	| {
			readonly state: "ok";
			/** Local calendar day the total covers, `YYYY-MM-DD`. */
			readonly day: string;
			/** US dollars, from each assistant message's `usage.cost.total`. */
			readonly usd: number;
			/** Session logs that contributed to the scan. */
			readonly sessions: number;
	  }
	| { readonly state: "unavailable"; readonly reason: string };

/** One Beads memory (`bd remember`). */
export interface CompanyMemory {
	readonly key: string;
	readonly text: string;
}

/** One project's Beads memories; `name` is its folder name. */
export type MemoryProject =
	| {
			readonly state: "ok";
			readonly cwd: string;
			readonly name: string;
			readonly memories: readonly CompanyMemory[];
	  }
	| {
			readonly state: "unavailable";
			readonly cwd: string;
			readonly name: string;
			readonly reason: string;
	  };

/** Company memory: every project the office agents work in, plus the app's own. */
export interface CompanyMemories {
	readonly projects: readonly MemoryProject[];
}

/** Save a memory in one of the company's projects (`bd remember`). */
export interface RememberRequest {
	/** Must be one of the `cwd`s `memories()` returned. */
	readonly cwd: string;
	readonly text: string;
	/** Slug to store it under; bd derives one from the text when omitted. */
	readonly key?: string;
}

export type StatsActionResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** `window.office.stats`: HUD figures computed in the main process. */
export interface OfficeStatsApi {
	costToday(): Promise<CostToday>;
	onCostToday(listener: (cost: CostToday) => void): Unsubscribe;
	/** Company memory: `bd memories --json` in every office project. */
	memories(): Promise<CompanyMemories>;
	remember(request: RememberRequest): Promise<StatsActionResult>;
	/** Delete a memory by key from one office project (`bd forget`). */
	forget(cwd: string, key: string): Promise<StatsActionResult>;
	/** Tell herdr the user has seen an agent's finished work (`agent focus <name>`). */
	markSeen(agentName: string): Promise<StatsActionResult>;
}
