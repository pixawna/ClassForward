import "server-only";
import { voiceConfig, narrationProvider, piperConfig } from "./config";
import { localNarrate } from "./local-voice";

/*
 * Narration with ElevenLabs. The with-timestamps endpoint returns the audio
 * and the time each character was spoken, which become word timings for the
 * captions.
 */

export type Word = { text: string; start: number; end: number };

export type Recording = { audio: Buffer; words: Word[]; seconds: number };

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export class VoiceError extends Error {}

/** Character timings to word timings. */
export function wordsFrom(alignment: Alignment | null | undefined): Word[] {
  if (!alignment) return [];
  const words: Word[] = [];
  let current: Word | null = null;
  alignment.characters.forEach((ch, i) => {
    const start = alignment.character_start_times_seconds[i];
    const end = alignment.character_end_times_seconds[i];
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (current) {
      current.text += ch;
      current.end = end;
    } else {
      current = { text: ch, start, end };
    }
  });
  if (current) words.push(current);
  return words;
}

/** What a recording was made from. A scene is re-recorded only when this changes. */
export function recordingKey(narration: string): string {
  if (narrationProvider() === "piper")
    return JSON.stringify([
      "piper-sentence-v1",
      piperConfig().model,
      narration,
    ]);
  const { voiceId, modelId } = voiceConfig();
  return JSON.stringify([voiceId, modelId, narration]);
}

export type Narrate = (
  text: string,
  context: { previous?: string; next?: string },
) => Promise<Recording>;

export const narrate: Narrate = async (text, context) => {
  if (narrationProvider() === "piper") {
    try {
      return await localNarrate(text);
    } catch (error) {
      throw new VoiceError(
        error instanceof Error ? error.message : "Local narration failed.",
      );
    }
  }
  const { apiKey, voiceId, modelId } = voiceConfig();
  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          // Neighboring scenes, so the voice flows naturally across cuts.
          previous_text: context.previous?.slice(-500),
          next_text: context.next?.slice(0, 500),
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
  } catch {
    throw new VoiceError(
      "Couldn't reach ElevenLabs. Check your internet connection and try again.",
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (
      res.status === 401 ||
      /invalid_api_key|api_key_id_used_as_api_key/.test(detail)
    ) {
      throw new VoiceError(
        "ElevenLabs rejected the API key. Set ELEVENLABS_API_KEY in .env.local to the secret API key, not the key ID, then restart the server.",
      );
    }
    if (res.status === 404 || /voice_not_found/.test(detail)) {
      throw new VoiceError(
        "ElevenLabs couldn't find that voice. Check ELEVENLABS_VOICE_ID in .env.local.",
      );
    }
    if (res.status === 429 || /quota/i.test(detail)) {
      throw new VoiceError(
        "ElevenLabs says the account is out of credits or busy. Check your plan, then render again.",
      );
    }
    throw new VoiceError(
      `ElevenLabs couldn't record the narration (${res.status}). Try rendering again.`,
    );
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: Alignment;
    normalized_alignment?: Alignment;
  };
  const words = wordsFrom(data.alignment ?? data.normalized_alignment);
  const audio = Buffer.from(data.audio_base64, "base64");
  return {
    audio,
    words,
    seconds: words.length ? words[words.length - 1].end : 0,
  };
};
