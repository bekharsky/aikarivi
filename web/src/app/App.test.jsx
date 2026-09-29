import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";
import { STORAGE_KEY } from "../core/notes.js";

describe("web app shell", () => {
  it("starts with a full automatic document title and can create a new document", async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = screen.getByRole("textbox", { name: "Document title" });

    expect(title.value).toMatch(/^\w+, \w+ \d{1,2}, \d{4} · \d{2}:\d{2}$/);
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(screen.getByRole("textbox", { name: "Document title" }).value).toMatch(/^\w+, \w+ \d{1,2}, \d{4} · \d{2}:\d{2}$/);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).notes).toBeTruthy());
    expect(Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)).notes)).toHaveLength(2);
  });

  it("persists a renamed document locally and offers saved documents without checkbox rows", async () => {
    const user = userEvent.setup();
    render(<App />);
    const title = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(title);
    await user.type(title, "Project notes");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).notes[JSON.parse(localStorage.getItem(STORAGE_KEY)).activeId].title).toBe("Project notes"));

    await user.click(screen.getByRole("combobox", { name: "Choose a document" }));
    expect(screen.getByRole("option", { name: /Project notes/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
  });
});
