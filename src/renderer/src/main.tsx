import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import { createLogger, setLogLevel } from "@shared/log/logger";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { installErrorHooks, reportError } from "./features/errors/errors-store";

setLogLevel(import.meta.env.DEV ? "debug" : "info");
installErrorHooks();

const log = createLogger("react");
const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
const container = root;

// xterm measures glyphs on open; load the terminal font first so cells are sized correctly.
void document.fonts.load('13px "JetBrains Mono"').finally(() => {
	createRoot(container, {
		// A boundary already reported it (with its region); a warning keeps it in devtools without a second inbox item.
		onCaughtError: (error) => log.warn("caught by an error boundary", { error }),
		onUncaughtError: (error) => reportError(error, "react"),
	}).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
});
