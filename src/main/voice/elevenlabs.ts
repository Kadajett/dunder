import { createLogger } from "@shared/log/logger";
import type { VoiceAvailability, VoiceResult } from "@shared/voice";
import { z } from "zod";
import type { VoiceSetup } from "./config";

const log = createLogger("voice");

const API = "https://api.elevenlabs.io/v1";
const STT_MODEL = "scribe_v1";
const TTS_MODEL = "eleven_v4";
const TIMEOUT_MS = 30_000;
const DETAIL_MAX = 200;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ElevenLabsDeps {
	readonly fetch: Fetch;
	readonly setup: () => Promise<VoiceSetup>;
}

const transcriptSchema = z.object({ text: z.string() });
// ElevenLabs errors: {"detail": {"status": "...", "message": "..."}} or {"detail": "..."}.
const errorSchema = z.object({
	detail: z.union([z.string(), z.looseObject({ message: z.string() })]),
});

const what = { stt: "speech-to-text", tts: "text-to-speech" } as const;
type Call = keyof typeof what;

/** A short reason for the strip; never carries the key or the request headers. */
async function failureOf(call: Call, response: Response): Promise<string> {
	const body = await response.text().catch(() => "");
	let detail = body;
	try {
		const parsed = errorSchema.safeParse(JSON.parse(body));
		if (parsed.success)
			detail =
				typeof parsed.data.detail === "string" ? parsed.data.detail : parsed.data.detail.message;
	} catch {
		// Not JSON: the raw text is the detail.
	}
	const prefix =
		response.status === 401
			? "ElevenLabs refused the API key (401)"
			: `ElevenLabs ${what[call]} failed (${response.status})`;
	const short = detail.trim().slice(0, DETAIL_MAX);
	return short ? `${prefix}: ${short}` : prefix;
}

/** File name for the upload; Scribe reads the container from it. */
function fileName(mimeType: string): string {
	const subtype = /^audio\/([\w.+-]+)/.exec(mimeType)?.[1] ?? "webm";
	return `turn.${subtype === "mp4" ? "m4a" : subtype === "mpeg" ? "mp3" : subtype}`;
}

/** ElevenLabs Scribe (speech to text) and TTS for calls with the chief. The key stays here. */
export class ElevenLabsVoice {
	readonly #deps: ElevenLabsDeps;

	constructor(deps: ElevenLabsDeps) {
		this.#deps = deps;
	}

	async available(): Promise<VoiceAvailability> {
		const setup = await this.#deps.setup();
		return setup.ok ? { available: true } : { available: false, reason: setup.reason };
	}

	async transcribe(audio: Uint8Array, mimeType: string): Promise<VoiceResult<string>> {
		const form = new FormData();
		form.append("model_id", STT_MODEL);
		form.append("file", new Blob([audio], { type: mimeType }), fileName(mimeType));
		const response = await this.#request("stt", () => "speech-to-text", { body: form });
		if (!response.ok) return response;
		const parsed = transcriptSchema.safeParse(await response.value.json().catch(() => null));
		if (!parsed.success) return { ok: false, reason: "ElevenLabs speech-to-text returned no text" };
		return { ok: true, value: parsed.data.text.trim() };
	}

	async speak(text: string): Promise<VoiceResult<Uint8Array>> {
		const response = await this.#request(
			"tts",
			(voiceId) => `text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
			{
				headers: { "content-type": "application/json", accept: "audio/mpeg" },
				// v4 performs a leading audio tag rather than reading it; lower stability varies delivery like speech.
				body: JSON.stringify({
					text: `[calm, conversational] ${text}`,
					model_id: TTS_MODEL,
					voice_settings: { stability: 0.4, similarity_boost: 0.75 },
				}),
			},
		);
		if (!response.ok) return response;
		return { ok: true, value: new Uint8Array(await response.value.arrayBuffer()) };
	}

	async #request(
		call: Call,
		path: (voiceId: string) => string,
		init: { readonly headers?: Record<string, string>; readonly body: FormData | string },
	): Promise<VoiceResult<Response>> {
		const setup = await this.#deps.setup();
		if (!setup.ok) return { ok: false, reason: setup.reason };
		const { key, voiceId } = setup.config;
		try {
			const response = await this.#deps.fetch(`${API}/${path(voiceId)}`, {
				method: "POST",
				headers: { ...init.headers, "xi-api-key": key },
				body: init.body,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
			if (response.ok) return { ok: true, value: response };
			const reason = await failureOf(call, response);
			log.warn("ElevenLabs request failed", { call: what[call], status: response.status });
			return { ok: false, reason };
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			log.warn("ElevenLabs unreachable", { call: what[call], detail });
			return { ok: false, reason: `Couldn't reach ElevenLabs: ${detail}`.slice(0, 300) };
		}
	}
}
