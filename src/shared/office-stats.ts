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

export type MemoriesResult =
	| { readonly state: "ok"; readonly cwd: string; readonly memories: readonly CompanyMemory[] }
	| { readonly state: "unavailable"; readonly cwd: string; readonly reason: string };

export type MarkSeenResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** `window.office.stats`: HUD figures computed in the main process. */
export interface OfficeStatsApi {
	costToday(): Promise<CostToday>;
	onCostToday(listener: (cost: CostToday) => void): Unsubscribe;
	/** Company memory: `bd memories --json` in the office agents' working directory. */
	memories(): Promise<MemoriesResult>;
	/** Tell herdr the user has seen an agent's finished work (`agent focus <name>`). */
	markSeen(agentName: string): Promise<MarkSeenResult>;
}
