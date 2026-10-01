import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PromptCard } from "@/components/prompt/prompt-card";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import type { PromptCard as PromptCardData } from "@/lib/types";

const base: PromptCardData = {
  id: "11111111-1111-4111-8111-111111111111", shortId: "abc1234", slug: "politely-decline-abc1234",
  title: "Politely decline a request", description: "Say no kindly.", category: { slug: "writing", name: "Writing" },
  tags: ["email"], models: ["chatgpt", "claude"], useCase: "generate",
  author: { id: "u1", username: "alex", name: "Alex", image: null, isSystem: false },
  ratingAvg: 4.5, ratingCount: 6, copyCount: 42, saveCount: 3, commentCount: 1, variableCount: 3, isFeatured: false,
  publishedAt: null, updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("PromptCard", () => {
  it("links to the prompt and shows category, rating, copies, models and variable count", () => {
    render(<PromptCard prompt={base} />);
    expect(screen.getByRole("link", { name: "Politely decline a request" })).toHaveAttribute("href", "/p/politely-decline-abc1234");
    expect(screen.getByText("Writing")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("fill-in fields").parentElement).toHaveTextContent("3");
    expect(screen.getByRole("img", { name: "Works with ChatGPT, Claude" })).toBeInTheDocument();
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  it("showStatus renders the status badge and the moderator note for rejected prompts", () => {
    render(<PromptCard showStatus prompt={{ ...base, status: "rejected", moderationNote: "Too promotional" }} />);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Rejected");
    expect(screen.getByText(/Too promotional/)).toBeInTheDocument();
  });

  it("shows a pending badge without a note", () => {
    render(<PromptCard showStatus prompt={{ ...base, status: "pending", moderationNote: "internal" }} />);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Pending review");
    expect(screen.queryByText(/internal/)).toBeNull();
  });

  it("ignores status unless showStatus is set", () => {
    render(<PromptCard prompt={{ ...base, status: "hidden" }} />);
    expect(screen.queryByTestId("status-badge")).toBeNull();
  });

  it("PromptGrid renders one card per prompt", () => {
    render(<PromptGrid prompts={[base, { ...base, id: "22222222-2222-4222-8222-222222222222", title: "Another" }]} />);
    expect(screen.getAllByTestId("prompt-card")).toHaveLength(2);
  });
});
