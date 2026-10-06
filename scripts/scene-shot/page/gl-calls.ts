/** The WebGL2 entry points three.js hits per object; their count is what the GPU process' CPU time scales with. */
const GL_METHODS = [
	"drawElements",
	"drawArrays",
	"drawElementsInstanced",
	"useProgram",
	"bindVertexArray",
	"bindTexture",
	"uniformMatrix4fv",
	"uniformMatrix3fv",
	"uniform3f",
	"uniform1f",
	"uniform1i",
	"texSubImage2D",
	"bindFramebuffer",
] as const;

export type GlCallCounts = Readonly<Record<string, number>>;

const counts: Record<string, number> = {};

/** Counts calls of the hot WebGL2 methods for the page's lifetime: deterministic, unlike timings on a shared GPU. */
export function instrumentGl(): void {
	const proto = WebGL2RenderingContext.prototype as unknown as Record<
		string,
		(...args: unknown[]) => unknown
	>;
	for (const name of GL_METHODS) {
		const original = proto[name];
		if (typeof original !== "function") continue;
		counts[name] = 0;
		proto[name] = function counted(this: unknown, ...args: unknown[]) {
			counts[name] = (counts[name] ?? 0) + 1;
			return original.apply(this, args);
		};
	}
}

export function glCallCounts(): GlCallCounts {
	return { ...counts };
}

/** Calls per frame between two snapshots, by method. */
export function glCallsPerFrame(
	before: GlCallCounts,
	after: GlCallCounts,
	frames: number,
): GlCallCounts {
	return Object.fromEntries(
		Object.entries(after).map(([name, count]) => [
			name,
			Math.round((count - (before[name] ?? 0)) / Math.max(1, frames)),
		]),
	);
}
