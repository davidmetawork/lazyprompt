import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/actions/prompts", () => ({ createPromptAction: vi.fn(), updatePromptAction: vi.fn(), deletePromptAction: vi.fn() }));
// jsdom has no ResizeObserver (Radix Checkbox measures its button).
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PromptForm } from "@/components/community/prompt-form";

const categories = [{ slug: "writing", name: "Writing" }, { slug: "coding", name: "Coding" }];

function setup(initial = {}) {
  render(<PromptForm mode="create" categories={categories} suggestUrl={null} initial={initial} />);
  return screen.getByLabelText("Prompt text") as HTMLTextAreaElement;
}
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("PromptForm variable detection", () => {
  it("shows an empty state until the body has variables", () => {
    setup();
    expect(screen.getByTestId("no-variables")).toBeInTheDocument();
  });

  it("detects plain variables and builds a row for each", () => {
    const body = setup();
    type(body, "Write a {{tone}} note to {{ audience }}.");
    const rows = screen.getAllByTestId("variable-row");
    expect(rows.map((r) => r.getAttribute("data-key"))).toEqual(["tone", "audience"]);
    expect(screen.getByLabelText("Label for audience")).toHaveValue("Audience");
  });

  it("parses inline shorthand into type, options and default", () => {
    const body = setup();
    type(body, "Reply in a {{tone:select(formal, casual)|formal}} voice.");
    expect(screen.getByLabelText("Type for tone")).toHaveValue("select");
    expect(screen.getByLabelText("Options for tone")).toHaveValue("formal, casual");
    expect(screen.getByLabelText("Default for tone")).toHaveValue("formal");
    expect(screen.getByLabelText("Required for tone")).not.toBeChecked();
  });

  it("lets the author edit a variable and reflects it in the preview", () => {
    const body = setup();
    type(body, "Hello {{name}}!");
    type(screen.getByLabelText("Label for name"), "Your name");
    const preview = screen.getByTestId("preview");
    expect(within(preview).getByText("[Your name]")).toBeInTheDocument();
    type(screen.getByLabelText("Default for name"), "Sam");
    expect(within(screen.getByTestId("preview")).getByText("Sam")).toBeInTheDocument();
  });

  it("removes a row when the variable leaves the body", () => {
    const body = setup();
    type(body, "A {{one}} and {{two}} prompt body.");
    expect(screen.getAllByTestId("variable-row")).toHaveLength(2);
    type(body, "A {{one}} prompt body.");
    expect(screen.getAllByTestId("variable-row")).toHaveLength(1);
  });

  it("shows template errors inline for malformed tokens", () => {
    const body = setup();
    type(body, "Broken {{not valid!}} token");
    expect(screen.getAllByRole("alert").some((a) => /not valid/i.test(a.textContent ?? ""))).toBe(true);
  });

  it("prefills from a fork", () => {
    setup({
      title: "Fork of Original", body: "Say {{greeting}}",
      variables: [{ key: "greeting", label: "Greeting", type: "text", required: true, help: "Be warm" }],
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Fork of Original");
    expect(screen.getByLabelText("Help for greeting")).toHaveValue("Be warm");
  });

  it("blocks submit and shows field errors for an incomplete prompt", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Submit prompt" }));
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Please fix the highlighted fields.")).toBeInTheDocument();
  });

  it("links to the guidelines", () => {
    setup();
    expect(screen.getByRole("link", { name: /community guidelines/i })).toHaveAttribute("href", "/guidelines");
  });
});
