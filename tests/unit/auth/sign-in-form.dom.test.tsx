import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { magicLink, social, push } = vi.hoisted(() => ({
  magicLink: vi.fn(), social: vi.fn(), push: vi.fn(),
}));
vi.mock("@/auth/client", () => ({ authClient: { signIn: { magicLink, social } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { SignInForm } from "@/components/auth/sign-in-form";

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    magicLink.mockResolvedValue({ error: null });
    social.mockResolvedValue({ error: null });
  });

  it("passes error callbacks and forwards next to check-email", async () => {
    render(<SignInForm next="/submit" googleEnabled githubEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));
    expect(social).toHaveBeenCalledWith({
      provider: "google", callbackURL: "/submit", errorCallbackURL: "/sign-in?error=oauth&from=oauth&next=%2Fsubmit",
    });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByRole("button", { name: /email me/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(magicLink).toHaveBeenCalledWith(expect.objectContaining({
      callbackURL: "/submit", errorCallbackURL: "/sign-in?error=link&from=link&next=%2Fsubmit",
    }));
    expect(push).toHaveBeenCalledWith("/sign-in/check-email?email=a%40b.co&next=%2Fsubmit");
  });

  it("hides the email form when email sign-in is unavailable", () => {
    render(<SignInForm googleEnabled githubEnabled={false} emailEnabled={false} />);
    expect(screen.getByRole("button", { name: /google/i })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText(/or use email/i)).toBeNull();
  });
});
