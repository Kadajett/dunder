/**
 * Returns a chunk consumer that emits each complete newline-terminated line.
 * Chunks must already be decoded text (e.g. `setEncoding("utf8")`) so that
 * multi-byte characters are never split across calls.
 */
export function createLineSplitter(onLine: (line: string) => void): (chunk: string) => void {
	let pending = "";
	return (chunk) => {
		pending += chunk;
		let index = pending.indexOf("\n");
		while (index !== -1) {
			const line = pending.slice(0, index).trim();
			pending = pending.slice(index + 1);
			if (line.length > 0) onLine(line);
			index = pending.indexOf("\n");
		}
	};
}
