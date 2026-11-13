import "server-only";
import { lessonDetailsKey, listSources, type Lesson } from "../lessons";
import {
  claudeConfig,
  ffmpegPath,
  VideoSetupError,
  voiceConfig,
  narrationProvider,
  piperConfig,
} from "./config";
import { DrawingError } from "./draw";
import { renderVideo, RenderError } from "./render";
import { StoryError, writeStory } from "./story";
import {
  getVideo,
  markFailed,
  markRendering,
  markWriting,
  saveStory,
} from "./store";
import type { Video } from "./types";
import { VoiceError } from "./voice";

/*
 * Writing a story takes Claude up to a minute or two, and rendering takes
 * several minutes, so both run in the background on the server. The page
 * polls the video's status. Jobs live in this server process: if it restarts
 * mid-job, settleStaleJob() marks the video as stopped so it can be retried.
 */

const globalJobs = globalThis as unknown as {
  classforwardVideoJobs?: Map<string, Promise<void>>;
};
const running = (globalJobs.classforwardVideoJobs ??= new Map());

export const isRunning = (lessonId: string) => running.has(lessonId);

/** Errors meant for the teacher keep their message; anything else gets a generic one (details in the log). */
function messageFor(err: unknown, fallback: string): string {
  const known = [
    VideoSetupError,
    StoryError,
    VoiceError,
    RenderError,
    DrawingError,
  ];
  if (known.some((E) => err instanceof E)) return (err as Error).message;
  console.error("[video]", err);
  return fallback;
}

function run(lessonId: string, job: () => Promise<void>) {
  const promise = job().finally(() => running.delete(lessonId));
  running.set(lessonId, promise);
}

/** Starts Claude writing the story. Throws VideoSetupError straight away if Claude isn't configured. */
export function startWriting(lesson: Lesson): Video {
  claudeConfig();
  if (isRunning(lesson.id)) return getVideo(lesson.id)!;
  const video = markWriting(lesson.id);
  run(lesson.id, async () => {
    try {
      const { story, model } = await writeStory(lesson, listSources(lesson.id));
      saveStory(video.id, story, model, lessonDetailsKey(lesson));
    } catch (err) {
      markFailed(
        video.id,
        "writing",
        messageFor(err, "ClassForward couldn't write the story. Try again."),
      );
    }
  });
  return getVideo(lesson.id)!;
}

/** Starts rendering. Throws VideoSetupError straight away if a key or ffmpeg is missing. */
export function startRender(lesson: Lesson): Video {
  claudeConfig();
  if (narrationProvider() === "piper") piperConfig();
  else voiceConfig();
  ffmpegPath();
  const video = getVideo(lesson.id);
  if (!video)
    throw new VideoSetupError("Write the story before rendering the video.");
  if (isRunning(lesson.id)) return video;
  markRendering(video.id);
  run(lesson.id, async () => {
    try {
      await renderVideo(getVideo(lesson.id)!);
    } catch (err) {
      markFailed(
        video.id,
        "rendering",
        messageFor(err, "The video couldn't be rendered. Try again."),
      );
    }
  });
  return getVideo(lesson.id)!;
}

/** True when the teacher has edited the lesson since its story was written. */
export function storyOutdated(video: Video | null, lesson: Lesson): boolean {
  return (
    !!video?.title &&
    !!video.storyFor &&
    video.storyFor !== lessonDetailsKey(lesson)
  );
}

/** A job marked as running that this server isn't actually running (it restarted). */
export function settleStaleJob(lessonId: string): Video | null {
  const video = getVideo(lessonId);
  if (
    video &&
    (video.status === "writing" || video.status === "rendering") &&
    !isRunning(lessonId)
  ) {
    markFailed(
      video.id,
      video.status,
      "This stopped because the server restarted. Start it again; finished drawings and recordings are kept.",
    );
    return getVideo(lessonId);
  }
  return video;
}
