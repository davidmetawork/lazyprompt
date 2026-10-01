import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { UsePanel } from "@/components/prompt/use-panel";
import { BODY, VARIABLES } from "./fixtures";

const prompt = { id: "11111111-1111-4111-8111-111111111111", shortId: "abc1234", title: "Letter", body: BODY, variables: VARIABLES, models: [] };
let writeText: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  toast.success.mockClear();
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: undefined });
});

describe("UsePanel", () => {
  it("updates the preview live and copies the filled text", async () => {
    render(<UsePanel prompt={prompt} category="writing" />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText(/Topic/), { target: { value: "the launch" } });
    expect(screen.getByTestId("prompt-preview").textContent).toContain("Write to Sam about the launch.");
    // the on-screen preview still shows the placeholder for the skipped optional variable
    expect(screen.getByTestId("prompt-preview").textContent).toContain("Context: [Context]");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      "Write to Sam about the launch.\nTone: warm\nWords: 120\nContext: "));
    // ...but the copied text never carries "[Context]" for an optional variable the user skipped
    expect(writeText.mock.calls[0]![0]).not.toContain("[Context]");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied"));
  });

  it("shows the feedback bar after a copy and sends worked without any variable values", async () => {
    render(<UsePanel prompt={prompt} />);
    expect(screen.queryByTestId("feedback-bar")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "SecretName" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    fireEvent.click(await screen.findByRole("button", { name: /Yes/ }));
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([
      { promptId: prompt.id, type: "copy" },
      { promptId: prompt.id, type: "worked" },
    ]);
    expect(JSON.stringify(bodies)).not.toContain("SecretName");
    expect(screen.getByText(/Thanks for the feedback/)).toBeInTheDocument();
  });

  it("warns about secrets", () => {
    render(<UsePanel prompt={prompt} />);
    expect(screen.getByText(/include passwords or secrets/)).toBeInTheDocument();
  });
});
