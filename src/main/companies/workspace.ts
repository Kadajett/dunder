import { z } from "zod";
import type { OfficeCli } from "../workforce/spawner";

const workspaceRef = z.object({ workspace_id: z.string().min(1), label: z.string().nullish() });
const listSchema = z.object({ result: z.object({ workspaces: z.array(workspaceRef) }) });
const createdSchema = z.object({ result: z.object({ workspace: workspaceRef }) });

/**
 * The id of the office-session workspace labelled `label`, creating it (an
 * idle shell in `cwd`, unfocused) when no workspace carries that label.
 */
export async function ensureWorkspace(
	cli: OfficeCli,
	label: string,
	cwd: string,
): Promise<{ readonly workspaceId: string }> {
	const listed = listSchema.parse(JSON.parse((await cli(["workspace", "list"])).stdout));
	const existing = listed.result.workspaces.find((workspace) => workspace.label === label);
	if (existing) return { workspaceId: existing.workspace_id };
	const create = ["workspace", "create", "--label", label, "--cwd", cwd, "--no-focus"];
	const created = createdSchema.parse(JSON.parse((await cli(create)).stdout));
	return { workspaceId: created.result.workspace.workspace_id };
}
