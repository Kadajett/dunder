// Inter 800 (main.tsx loads only 400/600/700): zone titles, world-card
// titles and bubble captions in the DOM, and the floor name rings' canvas, all set
// heavy tracked capitals like the reference.
import "@fontsource/inter/800.css";
// troika (drei <Text>) reads woff/ttf, not woff2, and must never fetch fonts from a CDN.
import interBold from "@fontsource/inter/files/inter-latin-800-normal.woff?url";
import monoRegular from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";
import monoBold from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url";
import { configureTextBuilder } from "troika-three-text";

// troika's web worker rebuilds its modules with eval, which our CSP (no
// 'unsafe-eval') forbids; the handful of 3D labels lay out fine on the main thread.
configureTextBuilder({ useWorker: false });

export const FONTS = {
	display: interBold,
	mono: monoRegular,
	monoBold,
} as const;
