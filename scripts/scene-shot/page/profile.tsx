// Side effect first: renderer modules read `window.office` at load.
import "./fake-office";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@renderer/styles.css";
import { createRoot } from "react-dom/client";
import { withoutSampleMail } from "./fake-office";
import { Scene } from "./office-scene";
import { installFrameProbe } from "./probe";

/**
 * `npm run scene:profile`: the real scene with stubbed IPC plus `window.__probe`
 * (frame and R3F loop time, draw and WebGL calls per frame, mesh counts), for
 * profiling the renderer without Electron. Desks carry no sticky notes unless
 * the URL has `?notes`, so the default numbers stay comparable across changes.
 */
if (!new URLSearchParams(location.search).has("notes")) withoutSampleMail();
installFrameProbe();

const root = document.getElementById("root");
if (!root) throw new Error("profile.html is missing #root");
createRoot(root).render(<Scene />);
