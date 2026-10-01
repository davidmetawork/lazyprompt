import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import { Linkify } from "@/components/ui/linkify";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { StarsDisplay } from "@/components/ui/stars-display";

describe("Linkify (jsdom)", () => {
  it("links http and https URLs with safe rel/target", () => {
    render(<Linkify text="See https://example.com/a?b=1, and http://x.org." />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://example.com/a?b=1");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "ugc nofollow noopener noreferrer");
    expect(links[1]).toHaveAttribute("href", "http://x.org");
  });
  it("does not link other schemes and never injects HTML", () => {
    const { container } = render(<Linkify text={'javascript:alert(1) <img src=x onerror=alert(1)> ftp://x.y'} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("StarsDisplay (jsdom)", () => {
  it("shows the average and count", () => {
    render(<StarsDisplay rating={4.25} count={8} />);
    expect(screen.getByText("4.3")).toBeInTheDocument();
    expect(screen.getByText("(8)")).toBeInTheDocument();
  });
  it("shows an empty state without ratings", () => {
    render(<StarsDisplay rating={null} count={0} />);
    expect(screen.getByText("No ratings yet")).toBeInTheDocument();
  });
});

describe("PaginationLinks (jsdom)", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<PaginationLinks basePath="/prompts" searchParams={{}} page={1} pageSize={24} total={10} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("preserves other search params and drops page=1", () => {
    render(<PaginationLinks basePath="/prompts" searchParams={{ q: "email", tag: ["a", "b"], page: "2" }} page={2} pageSize={24} total={100} />);
    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute("href", "/prompts?q=email&tag=a&tag=b");
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/prompts?q=email&tag=a&tag=b&page=3");
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });
});

describe("EmptyState (jsdom)", () => {
  it("renders title, description and action", () => {
    render(<EmptyState title="Nothing here" description="Try again" action={<button>Go</button>} />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
