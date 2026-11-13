// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DURATION_DEFAULT,
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEPS,
  formatDuration,
  isAllowedDuration,
} from "@/lib/lesson-limits";

describe("lesson length", () => {
  it("runs from 10 seconds to 30 minutes", () => {
    expect(DURATION_MIN).toBe(10);
    expect(DURATION_MAX).toBe(1800);
    expect(DURATION_STEPS[0]).toBe(DURATION_MIN);
    expect(DURATION_STEPS.at(-1)).toBe(DURATION_MAX);
    expect(DURATION_STEPS).toContain(DURATION_DEFAULT);
    expect([...DURATION_STEPS].sort((a, b) => a - b)).toEqual(DURATION_STEPS);
  });

  it("only allows the lengths on the slider", () => {
    expect(isAllowedDuration(10)).toBe(true);
    expect(isAllowedDuration(20)).toBe(true);
    expect(isAllowedDuration(90)).toBe(true);
    expect(isAllowedDuration(600)).toBe(true);
    expect(isAllowedDuration(5)).toBe(false);
    expect(isAllowedDuration(25)).toBe(false);
    expect(isAllowedDuration(1860)).toBe(false);
  });

  it("reads lengths the way a teacher would say them", () => {
    expect(formatDuration(10)).toBe("10 seconds");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(90)).toBe("1 minute 30 seconds");
    expect(formatDuration(900)).toBe("15 minutes");
    expect(formatDuration(10, "short")).toBe("10 sec");
    expect(formatDuration(90, "short")).toBe("1 min 30 sec");
    expect(formatDuration(1800, "short")).toBe("30 min");
  });
});
