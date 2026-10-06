import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CHIEF_HISTORY_LIMIT, type ChiefMessage, chiefMessageSchema } from "@shared/chief";
import { z } from "zod";

const historyFileSchema = z.object({
	version: z.literal(1),
	messages: z.array(chiefMessageSchema),
});

/** The chat so far; a missing or unreadable file starts a fresh chat. */
export async function loadChiefHistory(path: string): Promise<ChiefMessage[]> {
	try {
		const parsed = historyFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data.messages : [];
	} catch {
		return [];
	}
}

/** Pending write per file: saves land in call order and never share a temp file. */
const saving = new Map<string, Promise<void>>();

async function writeHistory(path: string, messages: readonly ChiefMessage[]): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	const file = { version: 1, messages: messages.slice(-CHIEF_HISTORY_LIMIT) };
	await writeFile(temp, `${JSON.stringify(file, null, "\t")}\n`, "utf8");
	await rename(temp, path);
}

/** Keep the last `CHIEF_HISTORY_LIMIT` messages; written atomically, one save at a time. */
export function saveChiefHistory(path: string, messages: readonly ChiefMessage[]): Promise<void> {
	const snapshot = [...messages];
	const previous = saving.get(path) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(() => writeHistory(path, snapshot));
	saving.set(path, next);
	const settle = (): void => {
		if (saving.get(path) === next) saving.delete(path);
	};
	next.then(settle, settle);
	return next;
}
