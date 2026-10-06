import "./fake-office";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@renderer/styles.css";
import { createRoot } from "react-dom/client";
import { Scene } from "./office-scene";
import { settle } from "./settle";

const root = document.getElementById("root");
if (!root) throw new Error("scene.html is missing #root");
createRoot(root).render(<Scene />);
void settle();
