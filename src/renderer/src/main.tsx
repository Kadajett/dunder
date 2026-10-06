import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");
const container = root;

// xterm measures glyphs on open; load the terminal font first so cells are sized correctly.
void document.fonts.load('13px "JetBrains Mono"').finally(() => {
	createRoot(container).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
});
