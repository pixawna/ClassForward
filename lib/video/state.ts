import "server-only";
import fs from "node:fs";
import { parseVtt } from "./captions";
import type { Lesson } from "../lessons";
import { settleStaleJob, storyOutdated } from "./jobs";
import { videoAssets } from "./render";
import { listScenes, videoFile } from "./store";
import type { Scene, Video } from "./types";

export type VideoChapter = { title: string; start: number; end: number };

/** Everything the video studio page shows, in one object the browser can poll. */
export type VideoState = {
  video: Video | null;
  scenes: Scene[];
  chapters: VideoChapter[];
  hasFile: boolean;
  /** The teacher edited the lesson after this story was written. */
  storyOutdated: boolean;
};

export function videoState(lesson: Lesson): VideoState {
  const lessonId = lesson.id;
  const video = settleStaleJob(lessonId);
  if (!video) return { video: null, scenes: [], chapters: [], hasFile: false, storyOutdated: false };
  const file = videoFile(lessonId)?.file;
  const hasFile = !!file && fs.existsSync(file);
  let chapters: VideoChapter[] = [];
  if (hasFile) {
    try {
      chapters = parseVtt(fs.readFileSync(videoAssets(file).chapters, "utf8")).map((c) => ({
        title: c.text,
        start: c.start,
        end: c.end,
      }));
    } catch {
      chapters = [];
    }
  }
  return { video, scenes: listScenes(video.id), chapters, hasFile, storyOutdated: storyOutdated(video, lesson) };
}
