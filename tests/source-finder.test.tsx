import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceFinder } from "@/app/classroom/lessons/[id]/SourceFinder";

vi.mock("@/app/classroom/lessons/actions", () => ({
  addLinkAction: vi.fn(), removeSourceAction: vi.fn(), saveSourceAction: vi.fn(),
}));

const result = {
  results: [{ url: "https://example.edu/water-cycle", title: "Water cycle explanation", description: "Evaporation and condensation.",
    site: "Example University", relevance: 1, kind: "Web page", authors: [], published: null, doi: null,
    readingGrade: 9, readingMinutes: 2, sections: ["Evaporation"], citedBy: null, verified: true, note: null }],
  notes: [], stats: { articles_read: 1, references_followed: 0 },
};

function mount(searchOnOpen = true) {
  return render(<StrictMode><SourceFinder lessonId="test-lesson" level="high_school" defaultQuery="Water cycle" initialSaved={[]} searchOnOpen={searchOnOpen} /></StrictMode>);
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("source search lifecycle", () => {
  it("shows an automatic search result after Strict Mode replays effects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify(result))));
    mount();
    expect(await screen.findByRole("link", { name: "Water cycle explanation" })).toBeTruthy();
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("ends a stalled request with an error and allows retry", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(85_000); });
    expect(screen.getByRole("alert").textContent).toContain("took too long");
    const button = screen.getByRole("button", { name: "Find sources" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fetcher.mockResolvedValue(new Response(JSON.stringify(result)));
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("link", { name: "Water cycle explanation" })).toBeTruthy();
  });

  it("shows a server failure instead of remaining in the searching state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: "Source provider unavailable." }), { status: 502 })));
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("Source provider unavailable.");
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("aborts active requests when the teacher leaves the page", () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      if (options.signal) signals.push(options.signal);
      return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    }));
    const view = mount();
    view.unmount();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
