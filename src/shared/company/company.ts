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

export const companySchema = z.object({
	version: z.literal(COMPANY_VERSION),
	id: companyIdSchema,
	name: z.string().trim().min(1).max(60),
	subtitle: z.string().trim().max(120),
	layout: layoutSchema,
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});
export type Company = z.infer<typeof companySchema>;

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
	/** Fires on switch, rename and every saved layout change. */
	onCurrent(listener: (company: Company) => void): Unsubscribe;
	switchTo(id: string): Promise<void>;
	/** New company seeded with the default office layout; becomes current. */
	create(name: string, subtitle: string): Promise<Company>;
	rename(id: string, name: string, subtitle: string): Promise<void>;
	/** Replace the current company's layout (edit mode saves through this). */
	saveLayout(layout: z.input<typeof layoutSchema>): Promise<void>;
	/** Make sure a herdr workspace with this label exists in the office session (for new zones). */
	ensureWorkspace(label: string): Promise<{ readonly workspaceId: string }>;
}
