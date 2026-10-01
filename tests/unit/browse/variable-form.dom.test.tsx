import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useVariableValues } from "@/components/prompt/use-variable-values";
import { VariableForm } from "@/components/prompt/variable-form";
import { loadVariableValues, saveVariableValues, variablesStorageKey } from "@/components/prompt/variable-storage";
import { VARIABLES } from "./fixtures";

function Harness({ shortId = "abc1234" }: { shortId?: string }) {
  const { values, setValue, reset } = useVariableValues(shortId, VARIABLES);
  return <VariableForm variables={VARIABLES} values={values} onChange={setValue} onReset={reset} />;
}

beforeEach(() => window.localStorage.clear());

describe("VariableForm", () => {
  it("renders an input per variable type with labels, help and required markers", () => {
    render(<Harness />);
    const name = screen.getByLabelText(/Name/);
    expect(name.tagName).toBe("INPUT");
    expect(name).toHaveAttribute("type", "text");
    expect(name).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Who it is for")).toBeInTheDocument();
    expect(screen.getByLabelText(/Topic/).tagName).toBe("TEXTAREA");
    const tone = screen.getByLabelText(/Tone/) as HTMLSelectElement;
    expect(tone.tagName).toBe("SELECT");
    expect(Array.from(tone.options).map((o) => o.value)).toEqual(["", "warm", "formal", "direct"]);
    expect(screen.getByLabelText(/Word count/)).toHaveAttribute("type", "number");
    expect(screen.getAllByText("*", { selector: "span[aria-hidden]" })).toHaveLength(2);
  });

  it("persists typed values to localStorage under lp:vars:<shortId>", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText(/Tone/), { target: { value: "formal" } });
    expect(JSON.parse(window.localStorage.getItem("lp:vars:abc1234")!)).toEqual({ name: "Sam", tone: "formal" });
  });

  it("restores saved values after mount", async () => {
    window.localStorage.setItem("lp:vars:abc1234", JSON.stringify({ name: "Riley", words: "50" }));
    render(<Harness />);
    expect(await screen.findByDisplayValue("Riley")).toBeInTheDocument();
    expect(screen.getByLabelText(/Word count/)).toHaveValue(50);
  });

  it("Reset clears the fields and the stored entry", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByLabelText(/Name/)).toHaveValue("");
    expect(window.localStorage.getItem("lp:vars:abc1234")).toBeNull();
  });

  it("renders nothing for a prompt without variables", () => {
    const { container } = render(<VariableForm variables={[]} values={{}} onChange={() => {}} onReset={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("variable storage helpers", () => {
  it("ignores unknown keys, non-string values and malformed JSON", () => {
    window.localStorage.setItem(variablesStorageKey("x"), JSON.stringify({ name: "A", ghost: "B", words: 5 }));
    expect(loadVariableValues("x", VARIABLES)).toEqual({ name: "A" });
    window.localStorage.setItem(variablesStorageKey("x"), "{not json");
    expect(loadVariableValues("x", VARIABLES)).toEqual({});
  });

  it("never throws when localStorage is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    try {
      expect(loadVariableValues("x", VARIABLES)).toEqual({});
      expect(() => saveVariableValues("x", { name: "A" })).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
