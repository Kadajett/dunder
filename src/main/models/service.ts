import type { AgentModel } from "@shared/models";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { WorkforceSupervisor } from "../workforce/supervisor";
import { createModelCatalog, loadOmpCatalog, type ModelCatalog } from "./catalog";
import { ModelService } from "./model-service";

export interface Models {
	readonly catalog: ModelCatalog;
	readonly service: ModelService;
}

/** Model catalog and live model tracking wired to omp and the office session. */
export function createModels(
	workforce: Pick<WorkforceSupervisor, "setAgentModel">,
	onLive: (live: Readonly<Record<string, AgentModel>>) => void,
): Models {
	const catalog = createModelCatalog(() => loadOmpCatalog());
	const service = new ModelService({
		cli: (args, timeoutMs) => runHerdr(officeArgs(args), timeoutMs),
		catalog,
		persist: (name, spec) => workforce.setAgentModel(name, spec),
		onLive,
	});
	return { catalog, service };
}
