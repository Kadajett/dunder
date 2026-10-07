import { z } from "zod";
import { layoutSchema } from "../layout/schema";
import type { Unsubscribe } from "../screens";

/**
 * A company is one office: its name, subtitle and layout. Every company lives
 * in the same herdr `office` session; a company's agents are the ones in the
 * herdr workspaces its layout zones are bound to (plus desks pinned by name).
 */
export const COMPANY_VERSION = 1;

export const companyIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);

/** An agent spending more than this (US dollars) in the alarm window gets a Trust Inbox item. */
export const DEFAULT_SPEND_ALARM_USD = 5;
/** How "Open in editor" opens an agent's worktree: the program (and flags) before the folder. */
export const DEFAULT_EDITOR_COMMAND = "code";

export const companySchema = z.object({
	version: z.literal(COMPANY_VERSION),
	id: companyIdSchema,
	name: z.string().trim().min(1).max(60),
	subtitle: z.string().trim().max(120),
	/** Runaway-spend alarm threshold per agent (companies saved before it get the default). */
	spendAlarmUsd: z.number().positive().max(10_000).default(DEFAULT_SPEND_ALARM_USD),
	/** "Open in editor" runs `<editorCommand> <worktree>` (companies saved before it get `code`). */
	editorCommand: z.string().trim().min(1).max(200).default(DEFAULT_EDITOR_COMMAND),
	layout: layoutSchema,
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});
export type Company = z.infer<typeof companySchema>;

/** What the company menu's settings form edits. */
export type CompanySettings = Pick<
	Company,
	"name" | "subtitle" | "spendAlarmUsd" | "editorCommand"
>;

export interface CompanySummary {
	readonly id: string;
	readonly name: string;
	readonly subtitle: string;
}

/** `window.office.companies`. All writes persist to disk before resolving. */
export interface CompaniesApi {
	list(): Promise<readonly CompanySummary[]>;
	/** The company shown in the office right now. */
	current(): Promise<Company>;
	/** Fires on switch, a settings change and every saved layout change. */
	onCurrent(listener: (company: Company) => void): Unsubscribe;
	switchTo(id: string): Promise<void>;
	/** New company seeded with the default office layout; becomes current. */
	create(name: string, subtitle: string): Promise<Company>;
	/** Name, subtitle (the wall sign follows) and the spend alarm. */
	updateSettings(id: string, settings: CompanySettings): Promise<void>;
	/** Replace the current company's layout (edit mode saves through this). */
	saveLayout(layout: z.input<typeof layoutSchema>): Promise<void>;
	/** Make sure a herdr workspace with this label exists in the office session (for new zones). */
	ensureWorkspace(label: string): Promise<{ readonly workspaceId: string }>;
}
