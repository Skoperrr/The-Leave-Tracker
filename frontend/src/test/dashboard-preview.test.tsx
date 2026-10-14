import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DashboardPreview from "../dev/DashboardPreview";

afterEach(() => vi.unstubAllGlobals());

describe("Read-only dashboard preview", () => {
  it("labels sample data, disables submission and switches examples without network requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DashboardPreview />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sample data · Read-only preview",
    );
    expect(
      screen.getByRole("heading", { name: "Hello, Ayanda." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Request leave" }),
    ).toBeDisabled();
    expect(
      screen.getByText("12", { selector: ".balance-number" }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("PREVIEW ORGANISATION"),
      "preview-field",
    );
    expect(
      screen.getByText("11", { selector: ".balance-number" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Here's your leave at The Field Institute/),
    ).toBeInTheDocument();
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "field",
    );
    expect(
      screen.getByRole("img", { name: "The Field Institute logo" }),
    ).toHaveAttribute("src", "/brands/field.png");
    await user.selectOptions(
      screen.getByLabelText("PREVIEW ORGANISATION"),
      "preview-stride",
    );
    expect(document.querySelector(".app-shell")).toHaveAttribute(
      "data-theme",
      "stride",
    );
    expect(
      screen.getByRole("img", { name: "StrideShift Global logo" }),
    ).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
