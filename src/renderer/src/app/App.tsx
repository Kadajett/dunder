import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { useOfficeSession } from "../features/herdr/useOfficeSession";
import { OfficeView } from "../features/office/OfficeView";

/** The app is the office: launching it shows the isometric 3D office, nothing else. */
export function App() {
	const { snapshot, status } = useOfficeSession();
	return (
		<div className="office-app">
			<OfficeView layout={DEFAULT_LAYOUT} snapshot={snapshot} />
			{status.state === "connected" ? null : (
				<div className="bridge-banner" data-state={status.state}>
					herdr office session: {status.state === "error" ? status.message : status.state}
				</div>
			)}
		</div>
	);
}
