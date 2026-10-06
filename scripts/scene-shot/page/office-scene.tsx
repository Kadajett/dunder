import { useOfficeSession } from "@renderer/features/herdr/useOfficeSession";
import { useOfficeModel } from "@renderer/features/office/model/office-model";
import { OfficeView } from "@renderer/features/office/OfficeView";
import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";

/** The real office scene (no HUD) for the default layout, with the crew from `fake-office`. */
export function Scene() {
	const { snapshot } = useOfficeSession();
	const model = useOfficeModel(DEFAULT_LAYOUT, snapshot);
	return (
		<div className="office-app" data-view="office">
			<OfficeView layout={DEFAULT_LAYOUT} model={model} />
		</div>
	);
}
