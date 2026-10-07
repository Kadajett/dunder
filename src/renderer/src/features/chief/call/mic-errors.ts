/** Plain words for each way opening the mic fails, by DOMException name; never a bare "error". */
const MESSAGES: Readonly<Record<string, string>> = {
	NotFoundError: "No microphone found. Plug one in or pick another input under Mic.",
	DevicesNotFoundError: "No microphone found. Plug one in or pick another input under Mic.",
	NotAllowedError:
		"Dunder isn't allowed to use the microphone (permission denied). Check the system's privacy settings.",
	PermissionDeniedError:
		"Dunder isn't allowed to use the microphone (permission denied). Check the system's privacy settings.",
	SecurityError: "Microphone access is blocked for this page.",
	NotReadableError:
		"The microphone is busy or failed to start: another app may be using it. Close it, or pick another input under Mic.",
	TrackStartError:
		"The microphone is busy or failed to start: another app may be using it. Close it, or pick another input under Mic.",
	OverconstrainedError: "The chosen microphone is gone; using the default input instead.",
	AbortError: "The microphone stopped while starting. Try again, or pick another input under Mic.",
};

/** The message for a getUserMedia failure, naming the error so it can be looked up. */
function nameOf(error: unknown): string {
	return typeof error === "object" &&
		error !== null &&
		"name" in error &&
		typeof error.name === "string"
		? error.name
		: "";
}

export function micErrorMessage(error: unknown): string {
	const name = nameOf(error);
	const known = MESSAGES[name];
	if (known) return `${known} (${name})`;
	const detail =
		typeof error === "object" && error !== null && "message" in error
			? String(error.message)
			: String(error);
	return `The microphone didn't start${name ? ` (${name})` : ""}: ${detail}`;
}

/** The chosen device is unavailable, so the default input should be tried instead. */
export function isDeviceGone(error: unknown): boolean {
	const name = nameOf(error);
	return name === "OverconstrainedError" || name === "NotFoundError";
}
