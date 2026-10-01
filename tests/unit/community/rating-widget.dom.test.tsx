import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/p/some-prompt-abc1234",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/actions/ratings", () => ({ rateAction: vi.fn(), removeRatingAction: vi.fn() }));

import { rateAction, removeRatingAction } from "@/actions/ratings";
import { RatingWidget } from "@/components/community/rating-widget";
import { trackEvent } from "@/lib/analytics";

const rate = vi.mocked(rateAction);
const remove = vi.mocked(removeRatingAction);

const base = {
  promptId: "11111111-1111-4111-8111-111111111111", slug: "some-prompt-abc1234",
  ratingAvg: 4, ratingCount: 2, viewerRating: null as number | null, signedIn: true, isAuthor: false,
};

beforeEach(() => { vi.clearAllMocks(); });

describe("RatingWidget", () => {
  it("renders a radiogroup with five stars and a roving tab stop", () => {
    render(<RatingWidget {...base} />);
    expect(screen.getByRole("radiogroup", { name: /rate this prompt/i })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("moves focus with arrow keys without submitting, and commits with Enter", async () => {
    rate.mockResolvedValue({ ok: true, data: { ratingAvg: 4, ratingCount: 3, viewerRating: 3 } });
    render(<RatingWidget {...base} />);
    const radios = screen.getAllByRole("radio");
    radios[0]!.focus();
    fireEvent.keyDown(radios[0]!, { key: "ArrowRight" });
    expect(radios[1]).toHaveFocus();
    fireEvent.keyDown(radios[1]!, { key: "End" });
    expect(radios[4]).toHaveFocus();
    fireEvent.keyDown(radios[4]!, { key: "ArrowLeft" });
    expect(radios[3]).toHaveFocus();
    expect(rate).not.toHaveBeenCalled();
    fireEvent.keyDown(radios[3]!, { key: "3" });
    await waitFor(() => expect(rate).toHaveBeenCalledWith({ promptId: base.promptId, slug: base.slug, stars: 3 }));
  });

  it("updates optimistically while the action is pending, then settles on the server value", async () => {
    let resolve!: (v: Awaited<ReturnType<typeof rateAction>>) => void;
    rate.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<RatingWidget {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /^5 stars/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /^5 stars/ })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("Your rating: 5 of 5")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
    await act(async () => { resolve({ ok: true, data: { ratingAvg: 4.3, ratingCount: 3, viewerRating: 5 } }); });
    await waitFor(() => expect(screen.getByText("4.3")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: /^5 stars/ })).toHaveAttribute("aria-checked", "true");
    expect(trackEvent).toHaveBeenCalledWith("prompt_rate", { stars: 5 });
  });

  it("rolls back when the action fails", async () => {
    rate.mockResolvedValue({ ok: false, code: "RATE_LIMITED", message: "Too many requests" });
    render(<RatingWidget {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /^2 stars/ }));
    await waitFor(() => expect(rate).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("radio", { name: /^2 stars/ })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("clears an existing rating", async () => {
    remove.mockResolvedValue({ ok: true, data: { ratingAvg: 4, ratingCount: 1, viewerRating: null } });
    render(<RatingWidget {...base} viewerRating={4} ratingCount={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear rating" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ promptId: base.promptId, slug: base.slug }));
    await waitFor(() => expect(screen.getByText("Click a star to rate")).toBeInTheDocument());
  });

  it("is read-only for the author", () => {
    render(<RatingWidget {...base} isAuthor />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("You can't rate your own prompt")).toBeInTheDocument();
    expect(screen.getByText("4.0")).toBeInTheDocument();
  });

  it("sends anonymous visitors to sign in", () => {
    render(<RatingWidget {...base} signedIn={false} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in to rate" })).toHaveAttribute(
      "href", `/sign-in?next=${encodeURIComponent("/p/some-prompt-abc1234#rate")}`,
    );
  });

  it("routes an expired session (UNAUTHENTICATED) to /sign-in with the current path", async () => {
    rate.mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", message: "Please sign in" });
    render(<RatingWidget {...base} />);
    fireEvent.click(screen.getByRole("radio", { name: /^4 stars/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/sign-in?next=${encodeURIComponent("/p/some-prompt-abc1234")}`));
  });
});
