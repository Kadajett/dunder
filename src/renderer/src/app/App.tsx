import { useEffect } from "react";
import { BrainstormDialog } from "../features/brainstorm/BrainstormDialog";
import { connectBoardPosts } from "../features/brainstorm/board-posts";
import { connectBrainstorm } from "../features/brainstorm/brainstorm-store";
import { ChiefOfStaffDock } from "../features/chief/ChiefOfStaffDock";
import { ClassicView } from "../features/classic/ClassicView";
import { connectCompanies, useCompany } from "../features/company/company-store";
import { EditDock } from "../features/edit/EditDock";
import { useEditedLayout } from "../features/edit/edit-store";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
import { connectAppErrors } from "../features/errors/errors-store";
import { connectFeed } from "../features/feed/feed-store";
import { useOfficeSession } from "../features/herdr/useOfficeSession";
import { HireDialog } from "../features/hire/HireDialog";
import { connectRoster } from "../features/hire/roster-store";
import { connectAlerts } from "../features/hud/alerts-store";
import { HudPanels } from "../features/hud/HudPanels";
import { connectSnoozes } from "../features/hud/snooze-store";
import { TopBar } from "../features/hud/TopBar";
import { useReportBusy } from "../features/hud/update-busy";
import { useHud } from "../features/hud/view-store";
import { TopCentre } from "../features/notices/NoticeSlot";
import { connectConversations } from "../features/office/conversations/conversation-store";
import { FocusOverlay } from "../features/office/focus/FocusOverlay";
import { useScreenTakeover } from "../features/office/focus/takeover";
import { WorldCards } from "../features/office/interaction/WorldCards";
import { connectMailQueue } from "../features/office/mail/mail-queue-store";
import { useOfficeModel } from "../features/office/model/office-model";
import { connectModels } from "../features/office/models/models-store";
import { OfficeView } from "../features/office/OfficeView";
import { TvFullscreen } from "../features/office/tv/TvFullscreen";
import { connectPlan } from "../features/plan/plan-store";
import { connectPool } from "../features/pool/pool-store";
import { TableView } from "../features/pool/TableView";
import { ShortcutsSheet } from "../features/shortcuts/ShortcutsSheet";
import { WhiteboardOverlay } from "../features/whiteboard/WhiteboardOverlay";
import { WorkBar } from "../features/work/WorkBar";
import { connectWork } from "../features/work/work-connect";

/**
 * The app is the office: the 3D room (or its Classic grid) with the HUD on
 * top — top bar, side panels, the work board on the left and the Chief of
 * Staff dock.
 */
export function App() {
	const { snapshot, status } = useOfficeSession();
	const view = useHud((state) => state.view);
	const layout = useEditedLayout(useCompany().layout);
	const model = useOfficeModel(layout, snapshot);
	const takeover = useScreenTakeover();
	useEffect(connectConversations, []);
	useEffect(connectModels, []);
	useEffect(connectMailQueue, []);
	useEffect(connectCompanies, []);
	useEffect(connectRoster, []);
	useEffect(connectBrainstorm, []);
	useEffect(connectBoardPosts, []);
	useEffect(connectFeed, []);
	useEffect(connectWork, []);
	useEffect(connectPool, []);
	useEffect(connectAppErrors, []);
	useEffect(connectSnoozes, []);
	useEffect(connectAlerts, []);
	useEffect(connectPlan, []);
	useReportBusy();
	return (
		<div className="office-app" data-view={view}>
			{view === "office" ? (
				<>
					<ErrorBoundary region="office view">
						<OfficeView layout={layout} model={model} />
					</ErrorBoundary>
					<ErrorBoundary region="agent cards">
						<WorldCards model={model} layout={layout} snapshot={snapshot} />
					</ErrorBoundary>
					<ErrorBoundary region="layout editor">
						<EditDock />
					</ErrorBoundary>
					<ErrorBoundary region="terminal view">
						<FocusOverlay />
					</ErrorBoundary>
					<ErrorBoundary region="pool table view">
						<TableView />
					</ErrorBoundary>
					<ErrorBoundary region="TV">
						<TvFullscreen />
					</ErrorBoundary>
				</>
			) : (
				<ErrorBoundary region="classic view">
					<ClassicView model={model} />
				</ErrorBoundary>
			)}
			<ErrorBoundary region="top bar">
				<TopBar snapshot={snapshot} />
			</ErrorBoundary>
			<ErrorBoundary region="notices">
				<TopCentre officeView={view === "office"} />
			</ErrorBoundary>
			<ErrorBoundary region="side panel">
				<HudPanels model={model} snapshot={snapshot} />
			</ErrorBoundary>
			<ErrorBoundary region="work bar">{takeover ? null : <WorkBar />}</ErrorBoundary>
			<ErrorBoundary region="chief of staff dock">
				<ChiefOfStaffDock model={model} />
			</ErrorBoundary>
			<ErrorBoundary region="hire dialog">
				<HireDialog snapshot={snapshot} />
			</ErrorBoundary>
			<ErrorBoundary region="whiteboard">
				<WhiteboardOverlay />
			</ErrorBoundary>
			<ErrorBoundary region="brainstorm dialog">
				<BrainstormDialog />
			</ErrorBoundary>
			<ErrorBoundary region="keyboard shortcuts">
				<ShortcutsSheet />
			</ErrorBoundary>
			{status.state === "connected" ? null : (
				<div className="bridge-banner" data-state={status.state}>
					herdr session “office”: {status.state === "error" ? status.message : status.state}
				</div>
			)}
		</div>
	);
}
