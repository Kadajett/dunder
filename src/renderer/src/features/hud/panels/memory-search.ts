import type { CompanyMemory, MemoryProject } from "@shared/office-stats";

/** One project group in the Brain panel. */
export interface ProjectGroup {
	readonly project: MemoryProject;
	/** Memories matching the search (all of them without one). */
	readonly shown: readonly CompanyMemory[];
	/** Every memory the project has. */
	readonly total: number;
}

/**
 * Group memories by project and filter them by a search across every
 * project's keys and texts. While searching, projects without a match drop out.
 */
export function searchMemories(projects: readonly MemoryProject[], query: string): ProjectGroup[] {
	const needle = query.trim().toLowerCase();
	const groups = projects.map((project) => {
		const memories = project.state === "ok" ? project.memories : [];
		const shown = needle
			? memories.filter((memory) => `${memory.key} ${memory.text}`.toLowerCase().includes(needle))
			: memories;
		return { project, shown, total: memories.length };
	});
	return needle ? groups.filter((group) => group.shown.length > 0) : groups;
}
