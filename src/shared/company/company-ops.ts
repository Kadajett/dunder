import { DEFAULT_LAYOUT } from "../layout/default-layout";
import type { Layout } from "../layout/schema";
import { COMPANY_VERSION, type Company, type CompanySummary } from "./company";

/** Longest slug before a de-duplication suffix (ids cap at 48 characters). */
const SLUG_MAX = 40;

/** `Keller Talent!` → `keller-talent`; never empty. */
export function slugify(name: string): string {
	const slug = name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, SLUG_MAX)
		.replace(/^-+|-+$/g, "");
	return slug || "company";
}

/** The slug of `name`, suffixed `-2`, `-3`, … until no existing id uses it. */
export function uniqueCompanyId(name: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const base = slugify(name);
	if (!used.has(base)) return base;
	let n = 2;
	while (used.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

/** The wall sign always shows the company: name and subtitle, painted in capitals. */
export function withCompanySign(layout: Layout, name: string, subtitle: string): Layout {
	const sign = { ...layout.room.sign, title: name.toUpperCase(), subtitle: subtitle.toUpperCase() };
	return { ...layout, room: { ...layout.room, sign } };
}

/** A new company in the default office. */
export function seedCompany(id: string, name: string, subtitle: string, now: Date): Company {
	const stamp = now.toISOString();
	return {
		version: COMPANY_VERSION,
		id,
		name,
		subtitle,
		layout: withCompanySign(DEFAULT_LAYOUT, name, subtitle),
		createdAt: stamp,
		updatedAt: stamp,
	};
}

/** First run: a fresh install opens at the Scranton branch; existing companies keep their names. */
export function firstCompany(now: Date): Company {
	const name = "Dunder Mifflin";
	return seedCompany(slugify(name), name, "Scranton branch · runs on Dunder", now);
}

export function summarize(company: Company): CompanySummary {
	return { id: company.id, name: company.name, subtitle: company.subtitle };
}
