import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle, THEME_STORAGE_KEY } from "@/components/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("adds the dark class and remembers the choice", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("toggles back to light", () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("still switches the theme when storage is unavailable", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    render(<ThemeToggle />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(document.documentElement).toHaveClass("dark");

    setItem.mockRestore();
  });

  it("labels the action by what the click will do", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to dark theme");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAccessibleName("Switch to light theme");
  });
});
