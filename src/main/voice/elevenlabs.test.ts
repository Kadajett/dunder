import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_ID, MISSING_KEY_REASON, readVoiceSetup, type VoiceSetup } from "./config";
import { ElevenLabsVoice, type Fetch } from "./elevenlabs";

const KEY = "sk_test_secret_value";
const ready: VoiceSetup = { ok: true, config: { key: KEY, voiceId: "voice-1" } };

interface Sent {
	readonly url: string;
	readonly init: RequestInit;
}

function voiceWith(respond: (sent: Sent) => Response | Promise<Response>, setup = ready) {
	const sent: Sent[] = [];
	const fetch: Fetch = async (url, init) => {
		sent.push({ url, init });
		return respond({ url, init });
	};
	return { voice: new ElevenLabsVoice({ fetch, setup: async () => setup }), sent };
}

const header = (sent: Sent | undefined, name: string) => new Headers(sent?.init.headers).get(name);

describe("ElevenLabsVoice", () => {
	it("transcribes with Scribe, sending the key and the recording", async () => {
		const { voice, sent } = voiceWith(() => Response.json({ text: "  Is the board fixed?  " }));
		const result = await voice.transcribe(new Uint8Array([1, 2, 3]), "audio/webm;codecs=opus");
		expect(result).toEqual({ ok: true, value: "Is the board fixed?" });
		expect(sent[0]?.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
		expect(header(sent[0], "xi-api-key")).toBe(KEY);
		const form = sent[0]?.init.body;
		expect(form instanceof FormData && form.get("model_id")).toBe("scribe_v1");
		const file = form instanceof FormData ? form.get("file") : null;
		expect(file instanceof File && [file.name, file.size]).toEqual(["turn.webm", 3]);
	});

	it("speaks in the configured voice and returns the MP3 bytes", async () => {
		const { voice, sent } = voiceWith(() => new Response(new Uint8Array([9, 8])));
		const result = await voice.speak("All good.");
		expect(result).toEqual({ ok: true, value: new Uint8Array([9, 8]) });
		expect(sent[0]?.url).toBe(
			"https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128",
		);
		expect(header(sent[0], "xi-api-key")).toBe(KEY);
		expect(JSON.parse(String(sent[0]?.init.body))).toMatchObject({ model_id: "eleven_v4" });
	});

	it("maps a refused key, an API error and a network failure to reasons without the key", async () => {
		const refused = voiceWith(() =>
			Response.json(
				{ detail: { status: "invalid_api_key", message: "Invalid API key" } },
				{ status: 401 },
			),
		);
		const broken = voiceWith(() => new Response("upstream timeout", { status: 503 }));
		const offline = voiceWith(() => Promise.reject(new TypeError("fetch failed")));
		const reasons = [
			await refused.voice.speak("hi"),
			await broken.voice.transcribe(new Uint8Array([1]), "audio/ogg"),
			await offline.voice.speak("hi"),
		].map((result) => (result.ok ? "ok" : result.reason));
		expect(reasons).toEqual([
			"ElevenLabs refused the API key (401): Invalid API key",
			"ElevenLabs speech-to-text failed (503): upstream timeout",
			"Couldn't reach ElevenLabs: fetch failed",
		]);
		for (const reason of reasons) expect(reason).not.toContain(KEY);
	});

	it("calls nothing and says what is missing without a key", async () => {
		const { voice, sent } = voiceWith(() => new Response(), {
			ok: false,
			reason: MISSING_KEY_REASON,
		});
		expect(await voice.available()).toEqual({ available: false, reason: MISSING_KEY_REASON });
		expect(await voice.speak("hi")).toEqual({ ok: false, reason: MISSING_KEY_REASON });
		expect(sent).toEqual([]);
	});
});

describe("readVoiceSetup", () => {
	const file = 'OTHER=1\nexport ELEVENLABS_API_KEY="from-file"\nELEVENLABS_VOICE_ID=file-voice\n';

	it("prefers the environment, then the secrets file", async () => {
		const env = { ELEVENLABS_API_KEY: "from-env" };
		expect(await readVoiceSetup(env, async () => file)).toEqual({
			ok: true,
			config: { key: "from-env", voiceId: "file-voice" },
		});
		expect(await readVoiceSetup({}, async () => file)).toEqual({
			ok: true,
			config: { key: "from-file", voiceId: "file-voice" },
		});
	});

	it("falls back to the default voice, and reports a missing key and file", async () => {
		expect(await readVoiceSetup({}, async () => "ELEVENLABS_API_KEY=k")).toEqual({
			ok: true,
			config: { key: "k", voiceId: DEFAULT_VOICE_ID },
		});
		const missing = await readVoiceSetup({}, () => Promise.reject(new Error("ENOENT")));
		expect(missing).toEqual({ ok: false, reason: MISSING_KEY_REASON });
		expect(MISSING_KEY_REASON).toContain("ELEVENLABS_API_KEY");
		expect(MISSING_KEY_REASON).toContain("~/.config/friday-personal/secrets.env");
	});
});
