import type { Harness } from "@shared/company/roster";
import { checkHire, type HireCheck, type HireRequest } from "@shared/company/workforce";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { useEffect, useMemo, useState } from "react";
import { useCompany } from "../company/company-store";
import { useModels } from "../office/models/models-store";
import { draftStyle, type LookDraft } from "./draft-look";
import { useHire } from "./hire-store";
import { useRosterStore } from "./roster-store";

export interface HireDraft extends LookDraft {
	readonly role: string;
	readonly harness: Harness;
	/** Empty: the harness's default model. */
	readonly model: string;
	readonly room: string;
	readonly cwd: string;
}

const EMPTY: HireDraft = {
	name: "",
	role: "generalist",
	harness: "omp",
	model: "",
	room: "",
	cwd: "",
	seed: undefined,
	look: undefined,
};

export function draftRequest(draft: HireDraft): HireRequest {
	const model = draft.model.trim();
	return {
		name: draft.name.trim(),
		role: draft.role,
		harness: draft.harness,
		...(model ? { model } : {}),
		workspaceLabel: draft.room,
		cwd: draft.cwd,
		style: draftStyle(draft),
	};
}

/** Room labels to offer: the session's workspaces and the company's zones. */
function useRooms(snapshot: SessionSnapshot | null): string[] {
	const zones = useCompany().layout.zones;
	return useMemo(() => {
		const labels = [
			...(snapshot?.workspaces.map((workspace) => workspace.label) ?? []),
			...zones.flatMap((zone) => (zone.workspaceLabel ? [zone.workspaceLabel] : [])),
		];
		return [...new Set(labels.filter((label) => label.length > 0))];
	}, [snapshot, zones]);
}

function useCheck(draft: HireDraft, snapshot: SessionSnapshot | null): HireCheck {
	const roster = useRosterStore((state) => state.roster);
	const catalog = useModels((state) => state.catalog);
	return useMemo(() => {
		const takenNames = new Set([
			...(roster?.agents.map((agent) => agent.name) ?? []),
			...(snapshot?.agents.flatMap((agent) => (agent.name ? [agent.name] : [])) ?? []),
		]);
		const context = catalog.length > 0 ? { takenNames, catalog } : { takenNames };
		return checkHire(draftRequest(draft), context);
	}, [draft, roster, snapshot, catalog]);
}

export interface HireFormState {
	readonly draft: HireDraft;
	update(patch: Partial<HireDraft>): void;
	/** Rooms to suggest. */
	readonly rooms: readonly string[];
	/** Live client-side validation of the draft. */
	readonly check: HireCheck;
	readonly busy: boolean;
	/** Why main refused the last hire. */
	readonly serverError: string | undefined;
	/** False while the preload predates the workforce API (main not restarted yet). */
	readonly available: boolean;
	submit(): Promise<void>;
	close(): void;
}

/** Form state, live validation and submission for the hire dialog. */
export function useHireForm(snapshot: SessionSnapshot | null): HireFormState {
	const close = useHire((state) => state.close);
	const [draft, setDraft] = useState<HireDraft>(EMPTY);
	const [busy, setBusy] = useState(false);
	const [serverError, setServerError] = useState<string>();
	const rooms = useRooms(snapshot);
	const check = useCheck(draft, snapshot);
	const available = "workforce" in window.office;
	useEffect(() => {
		if (!("workforce" in window.office)) return;
		void window.office.workforce
			.defaults()
			.then(({ cwd }) => setDraft((current) => (current.cwd ? current : { ...current, cwd })));
	}, []);
	useEffect(() => {
		const [first] = rooms;
		if (first) setDraft((current) => (current.room ? current : { ...current, room: first }));
	}, [rooms]);
	const update = (patch: Partial<HireDraft>): void => {
		setServerError(undefined);
		setDraft((current) => ({ ...current, ...patch }));
	};
	const submit = async (): Promise<void> => {
		if (!available || !check.ok || busy) return;
		setBusy(true);
		try {
			const result = await window.office.workforce.hire(draftRequest(draft));
			if (result.ok) close();
			else setServerError(result.error);
		} catch (error) {
			setServerError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};
	return { draft, update, rooms, check, busy, serverError, available, submit, close };
}
