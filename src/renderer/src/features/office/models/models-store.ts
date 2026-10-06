import type { AgentModel, ModelOption } from "@shared/models";
import { create } from "zustand";

interface ModelsState {
	/** Live model per agent name. */
	readonly live: Readonly<Record<string, AgentModel>>;
	readonly catalog: readonly ModelOption[];
	setLive(live: Readonly<Record<string, AgentModel>>): void;
	setCatalog(catalog: readonly ModelOption[]): void;
}

export const useModels = create<ModelsState>((set) => ({
	live: {},
	catalog: [],
	setLive: (live) => set({ live }),
	setCatalog: (catalog) => set({ catalog }),
}));

/** Providers listed first in the picker: the ones this machine signs in to directly. */
const PREFERRED_PROVIDERS = ["anthropic", "openai-codex"];

/** Catalog order for the picker: direct providers first, newest-looking ids first within each. */
export function pickerOrder(catalog: readonly ModelOption[]): ModelOption[] {
	const rank = (option: ModelOption): number => {
		const index = PREFERRED_PROVIDERS.indexOf(option.provider);
		return index === -1 ? PREFERRED_PROVIDERS.length : index;
	};
	return [...catalog].sort(
		(a, b) => rank(a) - rank(b) || b.selector.localeCompare(a.selector, "en", { numeric: true }),
	);
}

/**
 * Connect the store to the main-process model tracker (once per window).
 * Tolerates a preload that predates the models API, so a renderer hot-reload
 * ahead of a main restart never blanks the office.
 */
export function connectModels(): () => void {
	const api = "models" in window.office ? window.office.models : undefined;
	if (!api) return () => undefined;
	const store = useModels.getState();
	void api.live().then(store.setLive);
	void api.catalog().then(store.setCatalog);
	return api.onLive(store.setLive);
}
