import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { ROTATE_AT_BYTES, rotatedPath } from "./mailbox";

/** Appends in flight per results file: a rotation never races another append in this process. */
const chains = new Map<string, Promise<void>>();

/**
 * Append one answer line to a results file an office CLI polls, rotating it to
 * `<path>.1` first when the line would take it past `rotateAtBytes`. The CLIs
 * look for their answer in both generations, so one rotated away mid-wait is
 * still found.
 */
export function appendResultLine(
	path: string,
	line: string,
	rotateAtBytes = ROTATE_AT_BYTES,
): Promise<void> {
	const text = line.endsWith("\n") ? line : `${line}\n`;
	const write = (chains.get(path) ?? Promise.resolve()).then(async () => {
		await mkdir(dirname(path), { recursive: true });
		const size = await stat(path).then(
			(info) => info.size,
			() => 0,
		);
		if (size > 0 && size + Buffer.byteLength(text) > rotateAtBytes)
			await rename(path, rotatedPath(path));
		await appendFile(path, text);
	});
	chains.set(
		path,
		write.catch(() => undefined),
	);
	return write;
}
