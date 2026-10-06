import type { MemoriesResult } from "@shared/office-stats";
import { useCallback, useEffect, useMemo, useState } from "react";

const RESTART: MemoriesResult = {
	state: "unavailable",
	cwd: "",
	reason: "restart the app to load company memory",
};

interface Memories {
	readonly result: MemoriesResult | undefined;
	readonly reload: () => void;
}

function useMemories(): Memories {
	const [result, setResult] = useState<MemoriesResult>();
	const reload = useCallback(() => {
		if (!("stats" in window.office)) {
			setResult(RESTART);
			return;
		}
		setResult(undefined);
		void window.office.stats.memories().then(setResult);
	}, []);
	useEffect(reload, [reload]);
	return { result, reload };
}

function EmptyBrain() {
	return (
		<p className="hud-panel-empty">
			No company memories yet. Agents save what the company should remember with{" "}
			<code>bd remember "…"</code>; it shows up here, searchable.
		</p>
	);
}

/** Brain: the company's memory, kept as Beads memories in the office agents' project. */
export function BrainPanel() {
	const { result, reload } = useMemories();
	const [query, setQuery] = useState("");
	const memories = result?.state === "ok" ? result.memories : [];
	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return memories;
		return memories.filter((memory) =>
			`${memory.key} ${memory.text}`.toLowerCase().includes(needle),
		);
	}, [memories, query]);
	return (
		<>
			<div className="hud-panel-toolbar">
				<input
					className="hud-panel-search"
					type="search"
					placeholder={`Search ${memories.length} memories`}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<button type="button" onClick={reload}>
					Refresh
				</button>
			</div>
			{result === undefined ? <p className="hud-panel-empty">Reading company memory…</p> : null}
			{result?.state === "unavailable" ? (
				<p className="hud-panel-empty">
					Company memory is unavailable: {result.reason}
					{result.cwd ? (
						<>
							{" "}
							(in <code>{result.cwd}</code>)
						</>
					) : null}
				</p>
			) : null}
			{result?.state === "ok" && memories.length === 0 ? <EmptyBrain /> : null}
			{result?.state === "ok" && memories.length > 0 && shown.length === 0 ? (
				<p className="hud-panel-empty">No memory matches “{query}”.</p>
			) : null}
			{shown.map((memory) => (
				<article key={memory.key} className="hud-card">
					<div className="hud-memory-key">{memory.key}</div>
					<p className="hud-card-line">{memory.text}</p>
				</article>
			))}
			{result?.state === "ok" ? <p className="hud-card-meta">bd memories · {result.cwd}</p> : null}
		</>
	);
}
