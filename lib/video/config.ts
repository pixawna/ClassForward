import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * Settings for story videos, read from .env.local.
 * Missing keys produce a VideoSetupError whose message says exactly what to add.
 */

export class VideoSetupError extends Error {}

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
// "Rachel", one of ElevenLabs' premade voices. Pick any voice from your ElevenLabs
// voice library and put its ID in ELEVENLABS_VOICE_ID.
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
export const DEFAULT_VOICE_MODEL = "eleven_multilingual_v2";

export function claudeConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new VideoSetupError(
      "Story videos aren't set up yet. Add ANTHROPIC_API_KEY to .env.local (from console.anthropic.com > API keys) and restart the dev server.",
    );
  }
  return {
    apiKey,
    model: process.env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
  };
}

export function voiceConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new VideoSetupError(
      "ElevenLabs isn't set up yet. Add ELEVENLABS_API_KEY to .env.local (from elevenlabs.io > Developers > API keys) and restart the dev server.",
    );
  }
  return {
    apiKey,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_VOICE_MODEL,
  };
}

/** ffmpeg: FFMPEG_PATH if set, otherwise the copy bundled by @ffmpeg-installer/ffmpeg. */
export function ffmpegPath(): string {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) return configured;
  let bundled: string;
  try {
    const require = createRequire(import.meta.url);
    bundled = (require("@ffmpeg-installer/ffmpeg") as { path: string }).path;
  } catch {
    throw new VideoSetupError(
      "ffmpeg wasn't found. Run npm install, or install ffmpeg (brew install ffmpeg) and set FFMPEG_PATH in .env.local.",
    );
  }
  // npm may skip the package's install script that marks the binary executable.
  try {
    fs.accessSync(bundled, fs.constants.X_OK);
  } catch {
    fs.chmodSync(bundled, 0o755);
  }
  return bundled;
}

/** Explicit provider selection keeps local narration independent of cloud credentials. */
export function narrationProvider(): "piper" | "elevenlabs" {
  const provider = process.env.TTS_PROVIDER?.trim() || "elevenlabs";
  if (provider !== "piper" && provider !== "elevenlabs")
    throw new VideoSetupError("Set TTS_PROVIDER to piper or elevenlabs.");
  return provider;
}
export function piperConfig() {
  const python =
    process.env.PIPER_PYTHON ||
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "voice",
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
  const model =
    process.env.PIPER_MODEL ||
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "voice",
      "models",
      "en_US-ljspeech-high.onnx",
    );
  if (
    !fs.existsSync(python) ||
    !fs.existsSync(model) ||
    !fs.existsSync(`${model}.json`)
  )
    throw new VideoSetupError(
      "Set up local Piper narration using voice/README.md, then render again.",
    );
  return { python, model };
}
