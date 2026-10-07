import "./harness-status.css";
import { type Harness, harnessSchema } from "@shared/company/roster";
import type { HarnessCheck } from "@shared/company/workforce";
import { useHarnessCheck } from "./harness-check-store";

/** What a harness check means for Jeremy, in one line. */
export function harnessLine(
	harness: Harness,
	check: HarnessCheck | "checking",
): { readonly text: string; readonly tone: "ok" | "warn" | "error" | "busy" } {
	if (check === "checking") return { text: `Checking ${harness}…`, tone: "busy" };
	if (check.state === "ready") {
		return { text: harness === "omp" ? "omp is ready" : `${harness}: logged in`, tone: "ok" };
	}
	if (check.state === "not-ready") return { text: capitalised(check.reason), tone: "error" };
	return { text: `${capitalised(check.reason)}; hiring still works`, tone: "warn" };
}

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The harness check under the hire dialog's harness choice, and on a Team card when it fails. */
export function HarnessStatus({
	harness,
	check,
}: {
	readonly harness: Harness;
	readonly check: HarnessCheck | "checking" | null;
}) {
	if (!check) return null;
	const { text, tone } = harnessLine(harness, check);
	return (
		<p className="harness-status" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
			{text}
		</p>
	);
}

/**
 * On a codex or claude agent's Team card: the same line when its harness
 * can't answer (logged out, missing), so a blocked agent's cause is in view.
 */
export function HarnessWarning({ kind }: { readonly kind: string }) {
	const parsed = harnessSchema.safeParse(kind);
	const harness = parsed.success && parsed.data !== "omp" ? parsed.data : null;
	const check = useHarnessCheck(harness);
	if (!harness || check === null || check === "checking" || check.state !== "not-ready")
		return null;
	return <HarnessStatus harness={harness} check={check} />;
}
