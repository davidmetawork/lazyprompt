import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { OpenInMenu, isCopyOnlyPrompt, sortByDeclared } from "@/components/prompt/open-in-menu";

const calls: string[] = [];
let writeText: ReturnType<typeof vi.fn>;
let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls.length = 0;
  writeText = vi.fn(async (t: string) => { calls.push(`copy:${t}`); });
  open = vi.fn((...a: unknown[]) => { calls.push(`open:${String(a[0])}`); return null; });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.stubGlobal("open", open);
  window.open = open as unknown as typeof window.open;
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

// Radix menus need these in jsdom.
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("OpenInMenu", () => {
  it("copies first, then opens ChatGPT with the encoded text in a new tab", async () => {
    render(<OpenInMenu text="Hello & welcome" models={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in ChatGPT" }));
    expect(writeText).toHaveBeenCalledWith("Hello & welcome");
    expect(open).toHaveBeenCalledWith("https://chatgpt.com/?q=Hello%20%26%20welcome", "_blank", "noopener");
    expect(calls[0]).toBe("copy:Hello & welcome");
    expect(calls[1]).toMatch(/^open:https:\/\/chatgpt\.com\/\?q=/);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied", undefined));
  });

  it("opens Claude prefilled and hints about pasting", async () => {
    render(<OpenInMenu text="Hi" models={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in Claude" }));
    expect(open).toHaveBeenCalledWith("https://claude.ai/new?q=Hi", "_blank", "noopener");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied", expect.objectContaining({ description: expect.stringMatching(/paste/i) })));
  });

  it("falls back to the base URL and a paste toast when the text is too long to prefill", async () => {
    const long = "word ".repeat(600);
    render(<OpenInMenu text={long} models={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in ChatGPT" }));
    expect(writeText).toHaveBeenCalledWith(long);
    expect(open).toHaveBeenCalledWith("https://chatgpt.com/", "_blank", "noopener");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      "Copied – paste with ⌘V / Ctrl+V", expect.anything()));
  });

  it("copy-only apps (Gemini) copy, open the app, and say to paste", async () => {
    render(<OpenInMenu text="Hi" models={[]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Open in another app" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Gemini/ }));
    expect(writeText).toHaveBeenCalledWith("Hi");
    expect(open).toHaveBeenCalledWith("https://gemini.google.com/app", "_blank", "noopener");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied – paste with ⌘V / Ctrl+V", undefined));
  });

  it("warns that Perplexity sends immediately", async () => {
    render(<OpenInMenu text="Hi" models={[]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Open in another app" }), { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: /Perplexity/ });
    expect(item).toHaveTextContent("Sends immediately");
    fireEvent.click(item);
    expect(open).toHaveBeenCalledWith("https://www.perplexity.ai/search?q=Hi", "_blank", "noopener");
  });

  it("reports the opened model and whether it was prefilled", () => {
    const onOpened = vi.fn();
    render(<OpenInMenu text="Hi" models={[]} onOpened={onOpened} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in ChatGPT" }));
    expect(onOpened).toHaveBeenCalledWith({ model: "chatgpt", prefilled: true });
  });

  it("shows no Open buttons for image/video-only prompts", () => {
    const { container } = render(<OpenInMenu text="Hi" models={["midjourney", "flux"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("puts declared models first", () => {
    render(<OpenInMenu text="Hi" models={["claude"]} />);
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(labels.slice(0, 2)).toEqual(["Open in Claude", "Open in ChatGPT"]);
  });

  it("tells the user when the clipboard is unavailable", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn(() => false);
    render(<OpenInMenu text="Hi" models={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open in ChatGPT" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

describe("open-in helpers", () => {
  it("sortByDeclared keeps order within the declared and undeclared groups", () => {
    expect(sortByDeclared(["gemini", "perplexity", "grok", "copilot"], ["copilot", "gemini"]))
      .toEqual(["gemini", "copilot", "perplexity", "grok"]);
  });
  it("isCopyOnlyPrompt is true only when every declared model has no open target", () => {
    expect(isCopyOnlyPrompt([])).toBe(false);
    expect(isCopyOnlyPrompt(["sora", "veo"])).toBe(true);
    expect(isCopyOnlyPrompt(["sora", "chatgpt"])).toBe(false);
  });
});
