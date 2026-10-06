import type { CompaniesApi } from "@shared/company/company";
import { useEdit } from "./edit-store";

const RESTART =
	"Restart needed: this build can't save layouts yet. Your draft is kept — save again after the restart.";

/** `window.office.companies`, or null until the preload that provides it is loaded (needs an app restart). */
function companiesApi(): CompaniesApi | null {
	return "companies" in window.office ? window.office.companies : null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Make sure a herdr workspace with this label exists in the office session. */
export async function bindWorkspace(label: string): Promise<boolean> {
	const { setStatus } = useEdit.getState();
	const api = companiesApi();
	if (!api) {
		setStatus({
			tone: "error",
			text: `Restart needed to create workspace "${label}"; the binding is kept.`,
		});
		return false;
	}
	try {
		const { workspaceId } = await api.ensureWorkspace(label);
		setStatus({ tone: "info", text: `Workspace "${label}" ready (${workspaceId}).` });
		return true;
	} catch (error) {
		setStatus({ tone: "error", text: `Workspace "${label}": ${message(error)}` });
		return false;
	}
}

/** Save the draft as the current company's layout, creating herdr workspaces for newly bound zones. */
export async function saveDraft(): Promise<void> {
	const { draft, base, saving, setSaving, setStatus } = useEdit.getState();
	if (!draft || saving) return;
	const api = companiesApi();
	if (!api) {
		setStatus({ tone: "error", text: RESTART });
		return;
	}
	setSaving(true);
	setStatus({ tone: "info", text: "Saving…" });
	try {
		const known = new Set(base?.zones.map((zone) => zone.workspaceLabel));
		const fresh = new Set(draft.zones.flatMap((zone) => zone.workspaceLabel?.trim() || []));
		for (const label of fresh) if (!known.has(label)) await api.ensureWorkspace(label);
		await api.saveLayout(draft);
		useEdit.getState().saved();
	} catch (error) {
		setStatus({ tone: "error", text: `Save failed: ${message(error)}` });
	} finally {
		setSaving(false);
	}
}
