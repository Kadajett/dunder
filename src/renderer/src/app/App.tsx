import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { useEffect } from "react";
import { useOfficeSession } from "../features/herdr/useOfficeSession";
import { connectConversations } from "../features/office/conversations/conversation-store";
import { FocusOverlay } from "../features/office/focus/FocusOverlay";
import { WorldCards } from "../features/office/interaction/WorldCards";
import { useOfficeModel } from "../features/office/model/office-model";
import { connectModels } from "../features/office/models/models-store";
import { OfficeView } from "../features/office/OfficeView";

/** The app is the office: launching it shows the isometric 3D office, nothing else. */
export function App() {
	const { snapshot, status } = useOfficeSession();
	const layout = DEFAULT_LAYOUT;
	const model = useOfficeModel(layout, snapshot);
	useEffect(connectConversations, []);
	useEffect(connectModels, []);
	return (
		<div className="office-app">
			<OfficeView layout={layout} model={model} />
			<WorldCards model={model} layout={layout} snapshot={snapshot} />
			<FocusOverlay />
			{status.state === "connected" ? null : (
				<div className="bridge-banner" data-state={status.state}>
					herdr office session: {status.state === "error" ? status.message : status.state}
				</div>
			)}
		</div>
	);
}
