import { z } from "zod";

/** Longest memory the panel may save; durable insights are a few sentences, not documents. */
export const MAX_MEMORY_CHARS = 2_000;

const projectCwd = z.string().min(1).max(4_096);
/** bd memory keys are slugs (`dolt-phantoms`, `auth-jwt`). */
const memoryKey = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9][a-z0-9._-]*$/i, "use letters, digits, dots, dashes or underscores");

export const rememberRequestSchema = z.object({
	cwd: projectCwd,
	text: z
		.string()
		.trim()
		.min(1, "write the memory first")
		.max(MAX_MEMORY_CHARS, `keep a memory under ${MAX_MEMORY_CHARS} characters`),
	key: memoryKey.optional(),
});

export const forgetRequestSchema = z.object({
	cwd: projectCwd,
	// Existing keys come from bd itself; only bound their size and keep control bytes out.
	key: z
		.string()
		.min(1)
		.max(200)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
		.regex(/^[^\u0000-\u001f]+$/),
});

export type ParsedRequest<T> =
	| { readonly ok: true; readonly request: T }
	| { readonly ok: false; readonly reason: string };

/**
 * Validate a renderer request against its schema and the company's projects:
 * bd only ever runs in a directory the office itself reported.
 */
export function parseProjectRequest<T extends { readonly cwd: string }>(
	schema: z.ZodType<T>,
	payload: unknown,
	projects: readonly string[],
): ParsedRequest<T> {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid request" };
	}
	if (!projects.includes(parsed.data.cwd)) {
		return { ok: false, reason: `${parsed.data.cwd} is not one of the office's projects` };
	}
	return { ok: true, request: parsed.data };
}
