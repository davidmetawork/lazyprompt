import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReasonDialog } from "@/components/admin/reason-dialog";
import { UserBanControl } from "@/components/admin/user-row-actions";

vi.mock("@/actions/admin", () => ({
  setUserBanAction: vi.fn(), setTrustLevelAction: vi.fn(), moderatePromptAction: vi.fn(),
  moderateCommentAction: vi.fn(), resolveReportAction: vi.fn(),
}));

describe("ReasonDialog", () => {
  it("keeps the confirm button disabled until a required reason is typed, then confirms", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(
      <ReasonDialog
        trigger={<button>Open</button>} title="Reject?" description="Because" confirmLabel="Reject prompt"
        reasonRequired onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject prompt" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: "  Affiliate spam " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Affiliate spam"));
  });
});

describe("UserBanControl", () => {
  it("hides the ban button on the admin's own row", () => {
    render(<UserBanControl userId="a" username="me" banned={false} isSelf />);
    expect(screen.queryByRole("button", { name: /ban/i })).toBeNull();
  });
  it("shows Ban for active users and Unban for banned users", () => {
    const { rerender } = render(<UserBanControl userId="b" username="x" banned={false} isSelf={false} />);
    expect(screen.getByRole("button", { name: /ban/i })).toBeInTheDocument();
    rerender(<UserBanControl userId="b" username="x" banned isSelf={false} />);
    expect(screen.getByRole("button", { name: "Unban" })).toBeInTheDocument();
  });
});
