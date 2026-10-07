import { VOICE_ID_VAR, VOICE_KEY_VAR, VOICE_LANGUAGE_VAR, VOICE_SECRETS_FILE } from "@shared/voice";

/** George: a warm, calm male premade voice, used when ELEVENLABS_VOICE_ID is unset. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
/** Scribe's language unless ELEVENLABS_STT_LANGUAGE says otherwise (ISO 639-1/3). */
export const DEFAULT_LANGUAGE = "en";

export interface VoiceConfig {
	readonly key: string;
	readonly voiceId: string;
	/** What Jeremy speaks; Scribe is told rather than left to guess. */
	readonly language: string;
}

export type VoiceSetup =
	| { readonly ok: true; readonly config: VoiceConfig }
	| { readonly ok: false; readonly reason: string };

export const MISSING_KEY_REASON = `${VOICE_KEY_VAR} is not set (read from the environment, else ${VOICE_SECRETS_FILE})`;

/** `NAME=value` lines (optionally `export`ed or quoted), as in a shell env file. */
export function parseEnvFile(text: string): ReadonlyMap<string, string> {
	const values = new Map<string, string>();
	for (const line of text.split("\n")) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (!match?.[1]) continue;
		const value = (match[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
		if (value.length > 0) values.set(match[1], value);
	}
	return values;
}

/**
 * The ElevenLabs key and voice: the environment first, else Jeremy's
 * secrets file (Dunder only reads it). Read on every use, so adding the key
 * needs no restart.
 */
export async function readVoiceSetup(
	env: Readonly<Record<string, string | undefined>>,
	readSecrets: () => Promise<string>,
): Promise<VoiceSetup> {
	const secrets = await readSecrets().then(parseEnvFile, () => new Map<string, string>());
	const pick = (name: string): string | undefined => env[name]?.trim() || secrets.get(name);
	const key = pick(VOICE_KEY_VAR);
	if (!key) return { ok: false, reason: MISSING_KEY_REASON };
	return {
		ok: true,
		config: {
			key,
			voiceId: pick(VOICE_ID_VAR) ?? DEFAULT_VOICE_ID,
			language: pick(VOICE_LANGUAGE_VAR) ?? DEFAULT_LANGUAGE,
		},
	};
}
