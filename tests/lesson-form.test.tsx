import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonForm } from "@/app/classroom/lessons/new/LessonForm";
import { DURATION_STEPS } from "@/lib/lesson-limits";

vi.mock("@/app/classroom/lessons/actions", () => ({ createLessonAction: vi.fn() }));

afterEach(cleanup);

const slider = () => screen.getByLabelText("Lesson length") as HTMLInputElement;
const sent = (container: HTMLElement) =>
  (container.querySelector('input[type="hidden"][name="duration"]') as HTMLInputElement).value;

describe("lesson length field", () => {
  it("starts at 15 minutes and sends the length in seconds", () => {
    const { container } = render(<LessonForm />);
    expect(slider().getAttribute("aria-valuetext")).toBe("15 minutes");
    expect(sent(container)).toBe("900");
  });

  it("goes down to 10 seconds at the left end of the slider", () => {
    const { container } = render(<LessonForm />);
    fireEvent.change(slider(), { target: { value: "0" } });
    expect(slider().getAttribute("aria-valuetext")).toBe("10 seconds");
    expect(sent(container)).toBe("10");
    expect(screen.getByText("From 10 seconds to 30 minutes.")).toBeTruthy();
  });

  it("reaches 30 minutes at the right end", () => {
    const { container } = render(<LessonForm />);
    fireEvent.change(slider(), { target: { value: String(DURATION_STEPS.length - 1) } });
    expect(sent(container)).toBe("1800");
  });

  it("has a 10-second quick pick", () => {
    const { container } = render(<LessonForm />);
    const pick = screen.getByRole("button", { name: "10 sec" });
    fireEvent.click(pick);
    expect(pick.getAttribute("aria-pressed")).toBe("true");
    expect(sent(container)).toBe("10");
  });
});

describe("editing a lesson", () => {
  const initial = {
    topic: "The water cycle",
    level: "college",
    durationSeconds: 60,
    priorKnowledge: "They know the topic.",
    objectives: ["Describe the four stages of water cycle", "Explain condensation"],
  };

  it("starts from the lesson's saved details", () => {
    const { container } = render(
      <LessonForm action={vi.fn()} initial={initial} submitLabel="Save changes" cancelHref="/classroom/lessons/l1" />,
    );
    expect((screen.getByLabelText("Topic") as HTMLInputElement).value).toBe("The water cycle");
    expect((screen.getByLabelText(/College/) as HTMLInputElement).checked).toBe(true);
    expect(slider().getAttribute("aria-valuetext")).toBe("1 minute");
    expect(sent(container)).toBe("60");
    expect((screen.getByLabelText("What students already know") as HTMLTextAreaElement).value).toBe("They know the topic.");
    expect((screen.getByLabelText("Objective 2") as HTMLInputElement).value).toBe("Explain condensation");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/classroom/lessons/l1");
  });
});
