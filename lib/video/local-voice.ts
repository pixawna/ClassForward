import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { ffmpegPath, piperConfig } from "./config";
import type { Recording } from "./voice";

export async function localNarrate(text: string): Promise<Recording> {
  const { python, model } = piperConfig();
  const script = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "voice",
    "narrate.py",
  );
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ python, [script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Local narration took too long. Try a shorter scene."));
    }, 180000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 32 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      error = (error + chunk).slice(-2000);
    });
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Piper could not start. Follow voice/README.md to install it.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("[local narration]", error);
        reject(
          new Error(
            "Local narration failed. Check the Piper installation in voice/README.md.",
          ),
        );
      } else resolve(output);
    });
    child.stdin.end(JSON.stringify({ text, model, ffmpeg: ffmpegPath() }));
  });
  const data = JSON.parse(raw) as {
    audio_base64: string;
    seconds: number;
    words: Recording["words"];
  };
  if (
    !data.audio_base64 ||
    !Number.isFinite(data.seconds) ||
    data.seconds <= 0 ||
    !Array.isArray(data.words) ||
    !data.words.length
  )
    throw new Error("Piper returned no usable narration.");
  return {
    audio: Buffer.from(data.audio_base64, "base64"),
    seconds: data.seconds,
    words: data.words,
  };
}
