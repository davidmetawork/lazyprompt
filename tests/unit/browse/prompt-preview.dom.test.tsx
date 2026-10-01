import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PromptPreview } from "@/components/prompt/prompt-preview";
import { BODY, VARIABLES } from "./fixtures";

describe("PromptPreview", () => {
  it("shows unfilled variables as [Label] chips and lists missing required fields", () => {
    render(<PromptPreview body={BODY} variables={VARIABLES} values={{}} />);
    const preview = screen.getByTestId("prompt-preview");
    const chips = Array.from(preview.querySelectorAll("[data-unfilled]")).map((n) => n.textContent);
    expect(chips).toEqual(["[Name]", "[Topic]", "[Context]"]);
    expect(screen.getByTestId("missing-hint")).toHaveTextContent("Name, Topic");
  });

  it("highlights filled values and uses defaults for optional ones", () => {
    render(<PromptPreview body={BODY} variables={VARIABLES} values={{ name: "Sam", topic: "launch" }} />);
    const filled = Array.from(screen.getByTestId("prompt-preview").querySelectorAll("mark[data-filled]")).map((n) => n.textContent);
    expect(filled).toEqual(["Sam", "launch", "warm", "120"]);
    expect(screen.queryByTestId("missing-hint")).toBeNull();
  });

  it("renders values as text, never as HTML", () => {
    render(<PromptPreview body={BODY} variables={VARIABLES} values={{ name: "<img src=x onerror=alert(1)>" }} />);
    const preview = screen.getByTestId("prompt-preview");
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("does not re-parse placeholder syntax inside a value", () => {
    render(<PromptPreview body={BODY} variables={VARIABLES} values={{ name: "{{topic}}", topic: "X" }} />);
    expect(screen.getByTestId("prompt-preview").textContent).toContain("Write to {{topic}} about X.");
  });
});
