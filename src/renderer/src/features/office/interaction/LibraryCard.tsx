import { useMemo, useState } from "react";
import { searchMemories } from "../../hud/panels/memory-search";
import { useCompanyMemories } from "../../hud/panels/use-company-memories";
import { useHud } from "../../hud/view-store";

const STATUS = {
	loading: "Reading the shelves…",
	restart: "Restart the app to load company memory.",
} as const;

/** The library bookshelves: browse and search the company's Beads memories (`bd memories`). */
export function LibraryCard({ close }: { readonly close: () => void }) {
	const { load } = useCompanyMemories();
	const [query, setQuery] = useState("");
	const projects = load.state === "ready" ? load.memories.projects : [];
	const groups = useMemo(() => searchMemories(projects, query), [projects, query]);
	// Count every shelf, not just the ones a search leaves showing.
	const total = projects.reduce(
		(sum, project) => sum + (project.state === "ok" ? project.memories.length : 0),
		0,
	);
	const openBrain = (): void => {
		close();
		if (useHud.getState().panel !== "brain") useHud.getState().togglePanel("brain");
	};
	return (
		<aside className="world-card library-card">
			<header>
				<i className={`status-dot status-${load.state === "ready" ? "done" : "unknown"}`} />
				<strong>LIBRARY · COMPANY BRAIN</strong>
				<button type="button" className="card-close" onClick={close} aria-label="Close">
					×
				</button>
			</header>
			<p className="card-status">
				{load.state === "ready"
					? `${total} memories in ${projects.length} projects`
					: STATUS[load.state]}
			</p>
			{load.state === "ready" ? (
				<input
					className="card-search"
					type="search"
					placeholder="Search memories"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
			) : null}
			{load.state === "ready" && query.trim() && groups.length === 0 ? (
				<p className="card-empty">No memory matches “{query}”.</p>
			) : null}
			<div className="memory-shelf">
				{groups.map(({ project, shown }) => (
					<section key={project.cwd}>
						<h4 title={project.cwd}>{project.name}</h4>
						{project.state === "unavailable" ? (
							<p className="card-empty">Unavailable: {project.reason}</p>
						) : null}
						{project.state === "ok" && shown.length === 0 ? (
							<p className="card-empty">No memories yet.</p>
						) : null}
						<ol className="mail-list">
							{shown.map((memory) => (
								<li key={memory.key}>
									<strong>{memory.key}</strong>
									<p>{memory.text}</p>
								</li>
							))}
						</ol>
					</section>
				))}
			</div>
			<button type="button" className="card-action card-action-secondary" onClick={openBrain}>
				Remember or forget in the Brain panel
			</button>
		</aside>
	);
}
