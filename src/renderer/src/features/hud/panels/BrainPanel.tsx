import "./brain.css";
import { useMemo, useState } from "react";
import { MemoryCard } from "./MemoryCard";
import { type ProjectGroup, searchMemories } from "./memory-search";
import { RememberForm } from "./RememberForm";
import { useCompanyMemories } from "./use-company-memories";

function ProjectSection(props: { readonly group: ProjectGroup; readonly reload: () => void }) {
	const { group, reload } = props;
	const { project } = group;
	const count =
		group.shown.length === group.total
			? `${group.total}`
			: `${group.shown.length} / ${group.total}`;
	return (
		<section className="hud-brain-project">
			<header title={project.cwd}>
				<strong>{project.name}</strong>
				<span className="hud-brain-count">{count}</span>
				<code>{project.cwd}</code>
			</header>
			{project.state === "unavailable" ? (
				<p className="hud-panel-empty">Memory unavailable here: {project.reason}</p>
			) : null}
			{project.state === "ok" && group.total === 0 ? (
				<p className="hud-panel-empty">
					No memories yet. Agents save durable insights with <code>bd remember "…" --key …</code>,
					or use Remember… above.
				</p>
			) : null}
			{group.shown.map((memory) => (
				<MemoryCard key={memory.key} cwd={project.cwd} memory={memory} onForgotten={reload} />
			))}
		</section>
	);
}

/** Brain: company memory — the Beads memories of every project the office works in. */
export function BrainPanel() {
	const { load, reload } = useCompanyMemories();
	const [query, setQuery] = useState("");
	const projects = load.state === "ready" ? load.memories.projects : [];
	const groups = useMemo(() => searchMemories(projects, query), [projects, query]);
	const total = projects.reduce(
		(sum, project) => sum + (project.state === "ok" ? project.memories.length : 0),
		0,
	);
	if (load.state === "restart") {
		return <p className="hud-panel-empty">Restart the app to load company memory.</p>;
	}
	return (
		<>
			<div className="hud-panel-toolbar">
				<input
					className="hud-panel-search"
					type="search"
					placeholder={`Search ${total} memories in ${projects.length} projects`}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<button type="button" onClick={reload}>
					Refresh
				</button>
			</div>
			<RememberForm projects={projects} onSaved={reload} />
			{load.state === "loading" ? <p className="hud-panel-empty">Reading company memory…</p> : null}
			{load.state === "ready" && query.trim() && groups.length === 0 ? (
				<p className="hud-panel-empty">No memory matches “{query}”.</p>
			) : null}
			{groups.map((group) => (
				<ProjectSection key={group.project.cwd} group={group} reload={reload} />
			))}
		</>
	);
}
