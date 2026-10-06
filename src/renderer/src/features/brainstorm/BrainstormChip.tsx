import "./brainstorm.css";
import { endBrainstorm, useBrainstorm } from "./brainstorm-store";

/** In the top bar while a brainstorm runs: its topic, and a way to send everyone back. */
export function BrainstormChip() {
	const brainstorm = useBrainstorm();
	if (!brainstorm) return null;
	return (
		<div className="hud-chip brainstorm-chip" title={`Started by ${brainstorm.by}`}>
			<span className="brainstorm-dot" />
			<span className="brainstorm-label">
				Brainstorm: <strong>{brainstorm.topic}</strong>
			</span>
			<button type="button" className="brainstorm-end" onClick={endBrainstorm}>
				End
			</button>
		</div>
	);
}
