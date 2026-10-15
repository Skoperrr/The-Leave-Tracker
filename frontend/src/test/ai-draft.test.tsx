import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiLeaveDraft } from "../components/AiLeaveDraft";
import { generateLeaveDraft } from "../api/ai";
import { ApiClientError } from "../api/errors";
import type { AiDraftResult } from "../types/ai";

vi.mock("../api/ai", () => ({ generateLeaveDraft: vi.fn() }));
const ready: AiDraftResult = {
  status: "READY",
  referenceDate: "2026-10-15",
  timezone: "Africa/Johannesburg",
  draft: {
    organisationIds: ["org-dlab"],
    leaveTypeCode: "ANNUAL",
    startDate: "2026-10-22",
    endDate: "2026-10-23",
  },
  workingDays: 2,
  warnings: ["Balances checked at submission."],
};
const props = {
  organisationIds: ["org-dlab"],
  organisations: [{ organisationId: "org-dlab", organisationName: "D-Lab" }],
  leaveTypes: [{ code: "ANNUAL", name: "Annual leave" }],
  formRevision: "original",
  disabled: false,
  onApply: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateLeaveDraft).mockResolvedValue(ready);
});

describe("AI draft review interaction (mock API)", () => {
  it("requires input, reviews without saving and applies only on explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<AiLeaveDraft {...props} />);
    expect(
      screen.getByRole("button", { name: "Generate draft" }),
    ).toBeDisabled();
    await user.type(
      screen.getByLabelText("What leave would you like?"),
      "Annual leave 22–23 October 2026",
    );
    await user.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("AI suggestion — review before submitting");
    expect(screen.getByText("2 working days")).toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use these details" }));
    expect(props.onApply).toHaveBeenCalledOnce();
    expect(props.onApply).toHaveBeenCalledWith(ready);
    expect(screen.getByRole("status")).toHaveTextContent("Details applied");
  });
  it("shows clarification and retains the editable input without an apply button", async () => {
    vi.mocked(generateLeaveDraft).mockResolvedValue({
      referenceDate: "2026-10-15",
      timezone: "Africa/Johannesburg",
      status: "NEEDS_CLARIFICATION",
      draft: null,
      questions: ["Which dates and leave type?"],
    });
    const user = userEvent.setup();
    render(<AiLeaveDraft {...props} />);
    await user.type(
      screen.getByLabelText("What leave would you like?"),
      "A few days off soon",
    );
    await user.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("Which dates and leave type?");
    expect(
      screen.queryByRole("button", { name: "Use these details" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("What leave would you like?")).toHaveValue(
      "A few days off soon",
    );
  });
  it("preserves input and displays safe provider errors", async () => {
    vi.mocked(generateLeaveDraft).mockRejectedValue(
      new ApiClientError(
        503,
        "AI_NOT_CONFIGURED",
        "AI is not configured. Use the manual form.",
      ),
    );
    render(<AiLeaveDraft {...props} />);
    fireEvent.change(screen.getByLabelText("What leave would you like?"), {
      target: { value: "Annual leave tomorrow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use the manual form",
    );
    expect(screen.getByLabelText("What leave would you like?")).toHaveValue(
      "Annual leave tomorrow",
    );
    expect(props.onApply).not.toHaveBeenCalled();
  });
  it("aborts and ignores stale responses when the organisation changes", async () => {
    let resolve!: (value: AiDraftResult) => void;
    vi.mocked(generateLeaveDraft).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<AiLeaveDraft {...props} />);
    fireEvent.change(screen.getByLabelText("What leave would you like?"), {
      target: { value: "Annual leave 22–23 October 2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    const signal = vi.mocked(generateLeaveDraft).mock.calls[0][2];
    view.rerender(<AiLeaveDraft {...props} organisationIds={["org-field"]} />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(ready));
    expect(
      screen.queryByText("AI suggestion — review before submitting"),
    ).not.toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
  });
  it("invalidates a reviewed proposal when its source text or manual form changes", async () => {
    const view = render(<AiLeaveDraft {...props} />);
    const textarea = screen.getByLabelText("What leave would you like?");
    fireEvent.change(textarea, {
      target: { value: "Annual leave 22–23 October 2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("AI suggestion — review before submitting");
    view.rerender(<AiLeaveDraft {...props} formRevision="dates changed" />);
    expect(
      screen.queryByRole("button", { name: "Use these details" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("AI suggestion — review before submitting");
    fireEvent.change(textarea, { target: { value: "Sick leave tomorrow" } });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Use these details" }),
      ).not.toBeInTheDocument(),
    );
  });
});
