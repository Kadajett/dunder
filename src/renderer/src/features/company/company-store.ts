import type { CompaniesApi, Company, CompanySummary } from "@shared/company/company";
import { firstCompany, summarize } from "@shared/company/company-ops";
import { create } from "zustand";

interface CompaniesState {
	/** The company on screen; today's office until main answers. */
	readonly current: Company;
	readonly companies: readonly CompanySummary[];
	setCurrent(company: Company): void;
	setCompanies(companies: readonly CompanySummary[]): void;
}

const fallback = firstCompany(new Date());

export const useCompanies = create<CompaniesState>((set) => ({
	current: fallback,
	companies: [summarize(fallback)],
	setCurrent: (current) => set({ current }),
	setCompanies: (companies) => set({ companies }),
}));

/** The company on screen. */
export function useCompany(): Company {
	return useCompanies((state) => state.current);
}

/** Undefined while the preload predates the companies API (main not restarted yet). */
function companiesApi(): CompaniesApi | undefined {
	return "companies" in window.office ? window.office.companies : undefined;
}

async function refreshList(api: CompaniesApi): Promise<void> {
	useCompanies.getState().setCompanies(await api.list());
}

/**
 * Connect the store to the main-process company book (once per window). A
 * renderer hot-reload ahead of a main restart keeps the default office.
 */
export function connectCompanies(): () => void {
	const api = companiesApi();
	if (!api) return () => undefined;
	const store = useCompanies.getState();
	void api.current().then(store.setCurrent);
	void refreshList(api);
	return api.onCurrent((company) => {
		store.setCurrent(company);
		void refreshList(api);
	});
}

function requireApi(): CompaniesApi {
	const api = companiesApi();
	if (!api) throw new Error("Companies need an app restart.");
	return api;
}

export async function switchCompany(id: string): Promise<void> {
	await requireApi().switchTo(id);
}

/** Create a company with the default office; it becomes current. */
export async function createCompany(name: string, subtitle: string): Promise<void> {
	await requireApi().create(name, subtitle);
}

export async function renameCompany(id: string, name: string, subtitle: string): Promise<void> {
	const api = requireApi();
	await api.rename(id, name, subtitle);
	await refreshList(api);
}
