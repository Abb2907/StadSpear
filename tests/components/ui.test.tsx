import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

describe("<Badge />", () => {
  it("renders children", () => {
    render(<Badge>Live</Badge>);
    expect(screen.getByText("Live")).toBeDefined();
  });

  it("applies destructive variant classes for critical alerts", () => {
    render(<Badge variant="destructive">Critical</Badge>);
    const el = screen.getByText("Critical");
    expect(el.className).toContain("bg-destructive");
  });

  it("forwards aria-label for accessibility", () => {
    render(<Badge aria-label="new-alert">!</Badge>);
    expect(screen.getByLabelText("new-alert")).toBeDefined();
  });
});

describe("<Button />", () => {
  it("renders as a button by default", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.tagName).toBe("BUTTON");
  });

  it("respects the disabled attribute for a11y", () => {
    render(<Button disabled>Off</Button>);
    const btn = screen.getByRole("button", { name: "Off" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders as child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/x">Link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/x");
  });

  it("applies size variant class", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button", { name: "Small" });
    expect(btn.className).toContain("h-8");
  });
});
