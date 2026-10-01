import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/prompts", () => ({ createPromptAction: vi.fn(), updatePromptAction: vi.fn(), deletePromptAction: vi.fn() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PromptForm } from "@/components/community/prompt-form";

const categories = [{ slug: "writing", name: "Writing" }];
const mount = () => render(<PromptForm mode="create" categories={categories} suggestUrl={null} />);

describe("PromptForm draft and focus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("focuses the first invalid control after a failed submit", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("persists edits to localStorage and restores them on the next mount", () => {
    const first = mount();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My half-written prompt" } });
    expect(JSON.parse(window.localStorage.getItem("draft:new") ?? "{}").values.title).toBe("My half-written prompt");
    first.unmount();
    mount();
    expect(screen.getByLabelText("Title")).toHaveValue("My half-written prompt");
  });

  it("does not write a draft before the user edits anything", () => {
    mount();
    expect(window.localStorage.getItem("draft:new")).toBeNull();
  });
});
