import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TagInput } from "@/components/community/tag-input";

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return <TagInput value={tags} onChange={setTags} suggestUrl={null} />;
}
const box = () => screen.getByRole("combobox");
function add(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.keyDown(box(), { key: "Enter" });
}

describe("TagInput", () => {
  it("normalizes tags before adding them", () => {
    render(<Harness />);
    add("  Email  Marketing!! ");
    expect(screen.getByText("email-marketing")).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });

  it("adds on comma and removes with the chip button", () => {
    render(<Harness />);
    fireEvent.change(box(), { target: { value: "seo" } });
    fireEvent.keyDown(box(), { key: "," });
    expect(screen.getByText("seo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove tag seo" }));
    expect(screen.queryByText("seo")).toBeNull();
  });

  it("rejects tags that normalize to nothing and duplicates", () => {
    render(<Harness initial={["email"]} />);
    add("!");
    expect(screen.getByRole("alert")).toHaveTextContent(/2-32/);
    add("Email");
    expect(screen.getByRole("alert")).toHaveTextContent(/already added/);
    expect(screen.getAllByText("email")).toHaveLength(1);
  });

  it("stops at five tags", () => {
    render(<Harness initial={["a1", "b2", "c3", "d4"]} />);
    add("e5");
    expect(screen.getByText("e5")).toBeInTheDocument();
    expect(box()).toBeDisabled();
    expect(screen.getByText(/5\/5 tags/)).toBeInTheDocument();
  });

  it("removes the last tag with Backspace on an empty input", () => {
    render(<Harness initial={["alpha", "beta"]} />);
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(screen.queryByText("beta")).toBeNull();
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });
});
