import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/p/some-prompt-abc1234",
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/actions/saves", () => ({ setSavedAction: vi.fn() }));
vi.mock("@/actions/reports", () => ({ createReportAction: vi.fn() }));
vi.mock("@/actions/comments", () => ({ createCommentAction: vi.fn(), updateCommentAction: vi.fn(), deleteCommentAction: vi.fn() }));

import { createCommentAction } from "@/actions/comments";
import { createReportAction } from "@/actions/reports";
import { setSavedAction } from "@/actions/saves";
import { CommentItem } from "@/components/community/comment-item";
import { ForkButton } from "@/components/community/fork-button";
import { ReportButton } from "@/components/community/report-button";
import { SaveButton } from "@/components/community/save-button";
import type { CommentView } from "@/components/community/helpers";

const save = vi.mocked(setSavedAction);
const report = vi.mocked(createReportAction);
const comment = vi.mocked(createCommentAction);
const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => { vi.clearAllMocks(); });

describe("SaveButton", () => {
  it("toggles optimistically and reports the server count", async () => {
    save.mockResolvedValue({ ok: true, data: { saved: true, saveCount: 8 } });
    render(<SaveButton promptId={id} slug="s-abc1234" saved={false} saveCount={7} signedIn />);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ promptId: id, slug: "s-abc1234", saved: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: /saved/i })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("sends an UNAUTHENTICATED result to sign-in", async () => {
    save.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", message: "Please sign in" });
    render(<SaveButton promptId={id} slug="s-abc1234" saved={false} saveCount={0} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent("/p/some-prompt-abc1234")}`));
  });

  it("links anonymous visitors to sign-in", () => {
    render(<SaveButton promptId={id} slug="s-abc1234" saved={false} saveCount={3} signedIn={false} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent("/p/s-abc1234")}`);
  });
});

describe("ForkButton", () => {
  it("links to the prefilled submit form, via sign-in when anonymous", () => {
    const { rerender } = render(<ForkButton shortId="abc1234" signedIn />);
    expect(screen.getByRole("link", { name: /fork/i })).toHaveAttribute("href", "/submit?fork=abc1234");
    rerender(<ForkButton shortId="abc1234" signedIn={false} />);
    expect(screen.getByRole("link", { name: /fork/i })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent("/submit?fork=abc1234")}`);
  });
});

describe("ReportButton", () => {
  it("submits a reason and shows a success toast", async () => {
    report.mockResolvedValue({ ok: true, data: { id: "r1", autoHidden: false } });
    render(<ReportButton targetType="prompt" targetId={id} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    fireEvent.click(await screen.findByRole("radio", { name: "Spam or advertising" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith({ targetType: "prompt", targetId: id, reason: "spam", details: undefined }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("requires a reason", async () => {
    render(<ReportButton targetType="prompt" targetId={id} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Choose a reason")).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it("explains a duplicate report", async () => {
    report.mockResolvedValue({ ok: false, code: "CONFLICT", message: "dup" });
    render(<ReportButton targetType="comment" targetId={id} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    fireEvent.click(await screen.findByRole("radio", { name: "Something else" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("You already reported this")).toBeInTheDocument();
  });

  it("links anonymous visitors to sign-in", () => {
    render(<ReportButton targetType="prompt" targetId={id} signedIn={false} />);
    expect(screen.getByRole("link", { name: /report/i })).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent("/p/some-prompt-abc1234")}`);
  });
});

const author = { id: "u1", username: "sam", name: "Sam", image: null, isSystem: false };
function view(over: Partial<CommentView> = {}): CommentView {
  return {
    id, body: "Nice one https://example.com", status: "visible", author, createdAt: "2026-01-01T00:00:00Z", editedAt: null,
    isOwn: false, timeLabel: "2 days ago", canEdit: false, replies: [], ...over,
  };
}

describe("CommentItem", () => {
  it("offers Reply on top-level comments only", () => {
    const reply = view({ id: "22222222-2222-4222-8222-222222222222", body: "child" });
    render(<ul><CommentItem comment={view({ replies: [reply] })} promptId={id} slug="s-abc1234" signedIn depth={0} /></ul>);
    expect(screen.getAllByRole("button", { name: /^reply$/i })).toHaveLength(1);
    expect(screen.getAllByTestId("comment")).toHaveLength(2);
  });

  it("linkifies safely and shows the edited marker, pending badge and own actions", () => {
    render(<ul><CommentItem comment={view({ isOwn: true, canEdit: true, status: "pending", editedAt: "2026-01-02T00:00:00Z" })}
      promptId={id} slug="s-abc1234" signedIn depth={0} /></ul>);
    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute("rel", "ugc nofollow noopener noreferrer");
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
  });

  it("offers Report (not Edit/Delete) on other people's comments", () => {
    render(<ul><CommentItem comment={view()} promptId={id} slug="s-abc1234" signedIn depth={0} /></ul>);
    expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("posts a reply with the parent id and counts characters", async () => {
    comment.mockResolvedValue({ ok: true, data: { ...view(), replies: [] } });
    render(<ul><CommentItem comment={view()} promptId={id} slug="s-abc1234" signedIn depth={0} /></ul>);
    fireEvent.click(screen.getByRole("button", { name: /^reply$/i }));
    const box = screen.getByLabelText(/reply to sam/i);
    fireEvent.change(box, { target: { value: "Thanks!" } });
    expect(screen.getByText("7/2000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(comment).toHaveBeenCalledWith({ promptId: id, slug: "s-abc1234", parentId: id, body: "Thanks!" }));
  });
});
