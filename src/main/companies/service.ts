import { join } from "node:path";
import { type Company, type CompanySummary, companySchema } from "@shared/company/company";
import {
	seedCompany,
	summarize,
	uniqueCompanyId,
	withCompanySign,
} from "@shared/company/company-ops";
import { layoutSchema } from "@shared/layout/schema";
import { z } from "zod";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { OfficeCli } from "../workforce/spawner";
import { openCompanies, saveCompany, saveCurrentId } from "./store";
import { ensureWorkspace } from "./workspace";

export interface CompaniesDeps {
	/** `<userData>/companies`. */
	readonly dir: string;
	/** Working directory for workspaces created for new zones. */
	readonly appRoot: string;
	readonly cli: OfficeCli;
	/** The current company changed (switch, settings, saved layout). */
	readonly emit: (company: Company) => void;
	readonly now?: () => Date;
}

const identitySchema = companySchema.pick({ name: true, subtitle: true });
const settingsSchema = companySchema.pick({
	name: true,
	subtitle: true,
	spendAlarmUsd: true,
	editorCommand: true,
});
const workspaceLabelSchema = z.string().trim().min(1).max(64);

/** Run tasks one at a time, in call order; a failure does not block later tasks. */
function serializer(): <T>(task: () => Promise<T>) => Promise<T> {
	let tail: Promise<unknown> = Promise.resolve();
	return (task) => {
		const run = tail.then(task);
		tail = run.catch(() => undefined);
		return run;
	};
}

interface Book {
	readonly companies: Map<string, Company>;
	readonly currentId: string;
}

/**
 * The company book: every company on disk and which one is on screen. All
 * changes are serialized and persisted before their promise resolves.
 */
export class CompaniesService {
	readonly #deps: CompaniesDeps;
	readonly #serial = serializer();
	readonly #workspaces = serializer();
	#opened: Promise<Book> | undefined;

	constructor(deps: CompaniesDeps) {
		this.#deps = deps;
	}

	list(): Promise<readonly CompanySummary[]> {
		return this.#serial(async () => [...(await this.#book()).companies.values()].map(summarize));
	}

	current(): Promise<Company> {
		return this.#serial(async () => {
			const book = await this.#book();
			return findCompany(book, book.currentId);
		});
	}

	switchTo(id: string): Promise<void> {
		return this.#serial(async () => {
			const book = await this.#book();
			await this.#makeCurrent(book, findCompany(book, id));
		});
	}

	/** A new company in the default office; it becomes current. */
	create(name: string, subtitle: string): Promise<Company> {
		return this.#serial(async () => {
			const book = await this.#book();
			const identity = identitySchema.parse({ name, subtitle });
			const id = uniqueCompanyId(identity.name, book.companies.keys());
			const company = seedCompany(id, identity.name, identity.subtitle, this.#now());
			await this.#put(book, company);
			await this.#makeCurrent(book, company);
			return company;
		});
	}

	/** New name, subtitle (the wall sign follows) and spend alarm. */
	updateSettings(id: string, settings: unknown): Promise<void> {
		return this.#serial(async () => {
			const book = await this.#book();
			const company = findCompany(book, id);
			const next = settingsSchema.parse(settings);
			const layout = withCompanySign(company.layout, next.name, next.subtitle);
			const updatedAt = this.#now().toISOString();
			await this.#put(book, { ...company, ...next, layout, updatedAt });
		});
	}

	/** Replace the current company's layout; the wall sign stays the company's. */
	saveLayout(input: unknown): Promise<void> {
		return this.#serial(async () => {
			const book = await this.#book();
			const company = findCompany(book, book.currentId);
			const layout = withCompanySign(layoutSchema.parse(input), company.name, company.subtitle);
			await this.#put(book, { ...company, layout, updatedAt: this.#now().toISOString() });
		});
	}

	ensureWorkspace(label: string): Promise<{ readonly workspaceId: string }> {
		const valid = workspaceLabelSchema.parse(label);
		return this.#workspaces(() => ensureWorkspace(this.#deps.cli, valid, this.#deps.appRoot));
	}

	#now(): Date {
		return this.#deps.now?.() ?? new Date();
	}

	/** Opened once; a failed open is retried by the next call. */
	#book(): Promise<Book> {
		this.#opened ??= openCompanies(this.#deps.dir, this.#now()).then(
			({ companies, currentId }) => ({
				companies: new Map(companies.map((company) => [company.id, company])),
				currentId,
			}),
			(error: unknown) => {
				this.#opened = undefined;
				throw error;
			},
		);
		return this.#opened;
	}

	async #put(book: Book, company: Company): Promise<void> {
		await saveCompany(this.#deps.dir, company);
		book.companies.set(company.id, company);
		if (company.id === book.currentId) this.#deps.emit(company);
	}

	/** Persist the new current company, then swap in a book that names it. */
	async #makeCurrent(book: Book, company: Company): Promise<void> {
		await saveCurrentId(this.#deps.dir, company.id);
		this.#opened = Promise.resolve({ ...book, currentId: company.id });
		this.#deps.emit(company);
	}
}

function findCompany(book: Book, id: string): Company {
	const company = book.companies.get(id);
	if (!company) throw new Error(`no company "${id}"`);
	return company;
}

/** The app's company book in `<userData>/companies`, on the herdr `office` session. */
export function createCompanies(
	paths: { readonly userData: string; readonly appRoot: string },
	emit: (company: Company) => void,
): CompaniesService {
	return new CompaniesService({
		dir: join(paths.userData, "companies"),
		appRoot: paths.appRoot,
		cli: (args, timeoutMs) => runHerdr(officeArgs(args), timeoutMs),
		emit,
	});
}
