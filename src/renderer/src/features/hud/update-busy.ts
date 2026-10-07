import { useEffect, useState } from "react";
import { useHire } from "../hire/hire-store";
import { useFocus } from "../office/focus/focus-store";
import { useWhiteboard } from "../whiteboard/whiteboard-store";
import { busyReason } from "./busy-reason";

/** A key pressed this recently means he is typing. */
export const TYPING_MS = 20_000;

function useWindowFocused(): boolean {
	const [focused, setFocused] = useState(() => document.hasFocus());
	useEffect(() => {
		const on = () => setFocused(true);
		const off = () => setFocused(false);
		window.addEventListener("focus", on);
		window.addEventListener("blur", off);
		return () => {
			window.removeEventListener("focus", on);
			window.removeEventListener("blur", off);
		};
	}, []);
	return focused;
}

/** True from a key press until TYPING_MS of no keys (captured before terminals see them). */
function useTyping(): boolean {
	const [typing, setTyping] = useState(false);
	useEffect(() => {
		let timer: number | undefined;
		const onKey = () => {
			setTyping(true);
			window.clearTimeout(timer);
			timer = window.setTimeout(() => setTyping(false), TYPING_MS);
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("keydown", onKey, { capture: true });
		};
	}, []);
	return typing;
}

/** Tell main what Jeremy is busy with, so agents' updates wait until he is free (mount once). */
export function useReportBusy(): void {
	const focus = useFocus((state) => state.target?.kind ?? null);
	const whiteboard = useWhiteboard((state) => state.open);
	const hiring = useHire((state) => state.open);
	const focused = useWindowFocused();
	const typing = useTyping();
	const reason = busyReason({ focused, focus, whiteboard, hiring, typing });
	useEffect(() => {
		// A main process from before quiet updates has no handler: updates just count down as before.
		if (!("update" in window.office)) return;
		window.office.update.setBusy(reason).catch(() => undefined);
	}, [reason]);
}
