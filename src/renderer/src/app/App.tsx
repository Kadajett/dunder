import { useEffect } from "react";
import { BrainstormDialog } from "../features/brainstorm/BrainstormDialog";
import { connectBoardPosts } from "../features/brainstorm/board-posts";
import { connectBrainstorm } from "../features/brainstorm/brainstorm-store";
import { ChiefOfStaffDock } from "../features/chief/ChiefOfStaffDock";
import { ClassicView } from "../features/classic/ClassicView";
import { connectCompanies, useCompany } from "../features/company/company-store";
import { EditDock } from "../features/edit/EditDock";
import { useEditedLayout } from "../features/edit/edit-store";
import { ActivityFeed } from "../features/feed/ActivityFeed";
import { useOfficeSession } from "../features/herdr/useOfficeSession";
import { HireDialog } from "../features/hire/HireDialog";
import { connectRoster } from "../features/hire/roster-store";
import { HudPanels } from "../features/hud/HudPanels";
import { TopBar } from "../features/hud/TopBar";
import { useHud } from "../features/hud/view-store";
import { connectConversations } from "../features/office/conversations/conversation-store";
import { FocusOverlay } from "../features/office/focus/FocusOverlay";
import { WorldCards } from "../features/office/interaction/WorldCards";
import { connectMailQueue } from "../features/office/mail/mail-queue-store";
import { useOfficeModel } from "../features/office/model/office-model";
import { connectModels } from "../features/office/models/models-store";
import { OfficeView } from "../features/office/OfficeView";
import { TvFullscreen } from "../features/office/tv/TvFullscreen";
import { WhiteboardOverlay } from "../features/whiteboard/WhiteboardOverlay";

/**
 * The app is the office: the 3D room (or its Classic grid) with the HUD on
 * top — top bar, side panels, activity feed and the Chief of Staff dock.
 */
export function App() {
	const { snapshot, status } = useOfficeSession();
	const view = useHud((state) => state.view);
	const layout = useEditedLayout(useCompany().layout);
	const model = useOfficeModel(layout, snapshot);
	useEffect(connectConversations, []);
	useEffect(connectModels, []);
	useEffect(connectMailQueue, []);
	useEffect(connectCompanies, []);
	useEffect(connectRoster, []);
	useEffect(connectBrainstorm, []);
	useEffect(connectBoardPosts, []);
	return (
		<div className="office-app" data-view={view}>
			{view === "office" ? (
				<>
					<OfficeView layout={layout} model={model} />
					<WorldCards model={model} layout={layout} snapshot={snapshot} />
					<EditDock />
					<FocusOverlay />
					<TvFullscreen />
				</>
			) : (
				<ClassicView model={model} />
			)}
			<TopBar snapshot={snapshot} />
			<HudPanels model={model} snapshot={snapshot} />
			<ActivityFeed />
			<ChiefOfStaffDock model={model} />
			<HireDialog snapshot={snapshot} />
			<WhiteboardOverlay />
			<BrainstormDialog />
			{status.state === "connected" ? null : (
				<div className="bridge-banner" data-state={status.state}>
					herdr session “office”: {status.state === "error" ? status.message : status.state}
				</div>
			)}
		</div>
	);
}
