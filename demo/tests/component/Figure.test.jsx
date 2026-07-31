import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Figure } from "../../src/Figure.jsx";

describe("Figure", () => {
  it("renders an image with src and alt", () => {
    render(<Figure directive={{ src: "img.png", alt: "A diagram" }} />);
    const img = screen.getByAltText("A diagram");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "img.png");
  });

  it("renders a caption when provided", () => {
    render(<Figure directive={{ src: "img.png", caption: "Figure caption" }} />);
    expect(screen.getByText("Figure caption")).toBeInTheDocument();
  });

  it("renders nothing when no src", () => {
    const { container } = render(<Figure directive={{}} />);
    expect(container.children.length).toBe(0);
  });

  it("renders nothing when directive is null", () => {
    const { container } = render(<Figure directive={null} />);
    expect(container.children.length).toBe(0);
  });

  it("adds loading=lazy by default", () => {
    render(<Figure directive={{ src: "img.png" }} />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });

  it("omits loading=lazy when lazy=false", () => {
    const { container } = render(<Figure directive={{ src: "img.png", lazy: false }} />);
    const img = container.querySelector("img");
    expect(img).not.toHaveAttribute("loading");
  });
});
