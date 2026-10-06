import { lazy, Suspense } from "react";
import { useWhiteboard } from "./whiteboard-store";

/** tldraw is large: its code loads the first time the board opens, not with the app. */
const WhiteboardLayer = lazy(() =>
	import("./WhiteboardLayer").then((module) => ({ default: module.WhiteboardLayer })),
);

/** The whiteboard editor while it is open. Mount once. */
export function WhiteboardOverlay() {
	const open = useWhiteboard((state) => state.open);
	return open ? (
		<Suspense fallback={null}>
			<WhiteboardLayer />
		</Suspense>
	) : null;
}
