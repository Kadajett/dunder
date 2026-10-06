import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Company, companyIdSchema, companySchema } from "@shared/company/company";
import { firstCompany } from "@shared/company/company-ops";
import { z } from "zod";

/**
 * Companies live in one directory: `<id>.json` per company plus
 * `current.json` naming the company on screen. Writes are atomic; files that
 * fail validation are moved aside, never overwritten.
 */
const CURRENT_FILE = "current.json";
const currentSchema = z.object({ id: companyIdSchema });

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Parsed file contents, or `undefined` when missing. Invalid files are moved aside. */
async function readJson<T>(path: string, schema: z.ZodType<T>, now: Date): Promise<T | undefined> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	const parsed = schema.safeParse(json);
	if (parsed.success) return parsed.data;
	await rename(path, `${path}.invalid-${now.toISOString().replaceAll(":", "-")}`);
	return undefined;
}

async function writeJson(dir: string, file: string, value: unknown): Promise<void> {
	await mkdir(dir, { recursive: true });
	const path = join(dir, file);
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
	await rename(temp, path);
}

/**
 * Every valid company in `dir`, oldest first. A company whose id disagrees
 * with its file name is invalid.
 */
export async function loadCompanies(dir: string, now = new Date()): Promise<Company[]> {
	let files: string[];
	try {
		files = await readdir(dir);
	} catch (error) {
		if (isMissingFile(error)) return [];
		throw error;
	}
	const companies: Company[] = [];
	for (const file of files.sort()) {
		if (!file.endsWith(".json") || file === CURRENT_FILE) continue;
		const id = file.slice(0, -".json".length);
		const schema = companySchema.refine((company) => company.id === id);
		const company = await readJson(join(dir, file), schema, now);
		if (company) companies.push(company);
	}
	return companies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function saveCompany(dir: string, company: Company): Promise<void> {
	return writeJson(dir, `${company.id}.json`, company);
}

/** The id saved as current, if any (it may name a company that no longer exists). */
export async function loadCurrentId(dir: string, now = new Date()): Promise<string | undefined> {
	return (await readJson(join(dir, CURRENT_FILE), currentSchema, now))?.id;
}

export function saveCurrentId(dir: string, id: string): Promise<void> {
	return writeJson(dir, CURRENT_FILE, { id });
}

export interface OpenedCompanies {
	/** Oldest first; never empty. */
	readonly companies: readonly [Company, ...Company[]];
	readonly currentId: string;
}

/**
 * Load every company and the current one. First run seeds today's office;
 * a missing or dangling `current.json` falls back to the oldest company.
 */
export async function openCompanies(dir: string, now = new Date()): Promise<OpenedCompanies> {
	const [oldest, ...rest] = await loadCompanies(dir, now);
	const first = oldest ?? firstCompany(now);
	if (!oldest) await saveCompany(dir, first);
	const companies: [Company, ...Company[]] = [first, ...rest];
	const saved = await loadCurrentId(dir, now);
	const known = saved !== undefined && companies.some((company) => company.id === saved);
	const currentId = known ? saved : first.id;
	if (currentId !== saved) await saveCurrentId(dir, currentId);
	return { companies, currentId };
}
