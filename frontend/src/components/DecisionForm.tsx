import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../api/endpoints";
import { useRefreshLeave } from "../hooks/queries";
import { decisionSchema, type DecisionValues } from "../hooks/validation";
import { ErrorNotice, FieldError } from "./ui";
export function DecisionForm({
  requestId,
  disabled = false,
}: {
  requestId: string;
  disabled?: boolean;
}) {
  const refresh = useRefreshLeave();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DecisionValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: "APPROVE", comment: "" },
  });
  const decision = watch("decision");
  const mutation = useMutation({
    mutationFn: (values: DecisionValues) =>
      api.decideRequest(requestId, {
        decision: values.decision,
        ...(values.comment ? { comment: values.comment } : {}),
      }),
    onSettled: refresh,
  });
  if (disabled)
    return (
      <p className="notice">
        You cannot decide your own leave request. Another authorised reviewer
        must handle it.
      </p>
    );
  return (
    <form
      className="decision-form"
      noValidate
      onSubmit={handleSubmit((values) => {
        if (!mutation.isPending) mutation.mutate(values);
      })}
    >
      <fieldset disabled={mutation.isPending || mutation.isSuccess}>
        <legend>Review this request</legend>
        <div className="decision-fields">
          <div>
            <label htmlFor={`decision-${requestId}`}>Decision</label>
            <select id={`decision-${requestId}`} {...register("decision")}>
              <option value="APPROVE">Approve</option>
              <option value="DECLINE">Decline</option>
            </select>
          </div>
          <div>
            <label htmlFor={`comment-${requestId}`}>
              Comment {decision === "DECLINE" ? "(required)" : "(optional)"}
            </label>
            <textarea
              id={`comment-${requestId}`}
              rows={2}
              {...register("comment")}
              aria-invalid={Boolean(errors.comment)}
              aria-describedby={`comment-error-${requestId}`}
            />
            <FieldError
              id={`comment-error-${requestId}`}
              message={errors.comment?.message}
            />
          </div>
        </div>
        {mutation.isError && <ErrorNotice error={mutation.error} />}
        {mutation.isSuccess && <p role="status">Decision saved.</p>}
        <button
          className={decision === "DECLINE" ? "danger" : "primary"}
          disabled={mutation.isPending || mutation.isSuccess}
        >
          {mutation.isPending
            ? "Saving decision…"
            : decision === "DECLINE"
              ? "Decline request"
              : "Approve request"}
        </button>
      </fieldset>
    </form>
  );
}
