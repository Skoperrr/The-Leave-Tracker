import { useQueries, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../auth/AuthProvider";
import { useOrganisation } from "../auth/OrganizationProvider";
import { api } from "../api/endpoints";
import { useRefreshLeave } from "../hooks/queries";
import { requestSchema, type RequestValues } from "../hooks/validation";
import { today, workingDays } from "../hooks/dates";
import {
  EmptyState,
  ErrorNotice,
  FieldError,
  Loading,
  PageHeading,
} from "../components/ui";
import { RequestCard } from "../components/RequestCard";
import { AiLeaveDraft } from "../components/AiLeaveDraft";
export function NewRequest() {
  const { session } = useAuth();
  const { membership, memberships } = useOrganisation();
  const refresh = useRefreshLeave();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      organisationIds: [membership.organisationId],
      leaveTypeCode: "",
      startDate: today(),
      endDate: today(),
      reason: "",
    },
  });
  const ids = watch("organisationIds");
  const start = watch("startDate");
  const end = watch("endDate");
  const code = watch("leaveTypeCode");
  const types = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["api", session?.user.id, "leave-types", id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.leaveTypes(id, signal),
    })),
  });
  const loading = types.some((query) => query.isPending);
  const typeError = types.find((query) => query.isError)?.error;
  const sharedTypes =
    !loading && !typeError
      ? (types[0]?.data?.data ?? []).filter((type) =>
          types.every((query) =>
            query.data?.data.some((item) => item.code === type.code),
          ),
        )
      : [];
  const mutation = useMutation({
    mutationFn: api.createRequest,
    onSettled: refresh,
  });
  if (mutation.isSuccess)
    return (
      <>
        <PageHeading
          eyebrow="REQUEST SENT"
          title="Your time away is on its way."
        >
          Each organisation reviews its own request independently.
        </PageHeading>
        <div className="notice success" role="status">
          Submitted successfully. The working days below are confirmed by the
          server. Approval in one organisation does not approve the others.
        </div>
        <div className="request-list">
          {mutation.data.data.requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
        <Link to="/requests" className="primary button">
          Track all organisation decisions →
        </Link>
      </>
    );
  return (
    <>
      <PageHeading eyebrow="MAKE ROOM FOR A BREAK" title="Request leave">
        One set of dates. A separate decision for each organisation.
      </PageHeading>
      <div className="form-layout">
        <form
          className="panel leave-form"
          noValidate
          onSubmit={handleSubmit((values) => {
            if (mutation.isPending) return;
            if (
              values.organisationIds.some(
                (id) => !memberships.some((item) => item.organisationId === id),
              )
            ) {
              setError("organisationIds", {
                message: "Choose only your active organisations.",
              });
              return;
            }
            if (
              !sharedTypes.some((type) => type.code === values.leaveTypeCode)
            ) {
              setError("leaveTypeCode", {
                message:
                  "Choose a type available in every selected organisation.",
              });
              return;
            }
            mutation.mutate({
              organisationIds: values.organisationIds,
              leaveTypeCode: values.leaveTypeCode,
              startDate: values.startDate,
              endDate: values.endDate,
              ...(values.reason ? { reason: values.reason } : {}),
            });
          })}
        >
          <fieldset disabled={mutation.isPending}>
            <legend>Leave details</legend>
            <fieldset className="org-fieldset">
              <legend>Which organisations?</legend>
              <p className="muted">
                Choose every organisation where you need time away.
              </p>
              {memberships.map((item) => (
                <label className="checkbox-row" key={item.id}>
                  <input
                    type="checkbox"
                    value={item.organisationId}
                    {...register("organisationIds")}
                    aria-describedby="org-error"
                  />
                  <span>{item.organisationName}</span>
                </label>
              ))}
              <FieldError
                id="org-error"
                message={errors.organisationIds?.message}
              />
            </fieldset>
            <AiLeaveDraft
              key={membership.id}
              organisationIds={ids}
              organisations={memberships}
              leaveTypes={sharedTypes}
              formRevision={`${code}|${start}|${end}`}
              disabled={mutation.isPending || loading || Boolean(typeError)}
              onApply={({ draft }) => {
                setValue("leaveTypeCode", draft.leaveTypeCode, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("startDate", draft.startDate, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setValue("endDate", draft.endDate, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
            <label htmlFor="leave-type">Leave type</label>
            <select
              id="leave-type"
              {...register("leaveTypeCode")}
              disabled={loading || Boolean(typeError) || mutation.isPending}
              aria-invalid={Boolean(errors.leaveTypeCode)}
              aria-describedby="type-error"
            >
              <option value="">Choose a leave type</option>
              {sharedTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
            <FieldError
              id="type-error"
              message={errors.leaveTypeCode?.message}
            />
            {loading && <Loading label="Loading leave types" />}
            {typeError && (
              <ErrorNotice
                error={typeError}
                retry={() =>
                  types.forEach((query) => {
                    void query.refetch();
                  })
                }
              />
            )}
            {ids.length > 0 &&
              !loading &&
              !typeError &&
              sharedTypes.length === 0 && (
                <EmptyState title="No shared leave type">
                  These organisations have no matching leave type. Change your
                  selection or ask your administrator.
                </EmptyState>
              )}
            <div className="date-fields">
              <div>
                <label htmlFor="start-date">Start date</label>
                <input
                  id="start-date"
                  type="date"
                  {...register("startDate")}
                  aria-invalid={Boolean(errors.startDate)}
                  aria-describedby="start-error"
                />
                <FieldError
                  id="start-error"
                  message={errors.startDate?.message}
                />
              </div>
              <div>
                <label htmlFor="end-date">End date</label>
                <input
                  id="end-date"
                  type="date"
                  {...register("endDate")}
                  aria-invalid={Boolean(errors.endDate)}
                  aria-describedby="end-error"
                />
                <FieldError id="end-error" message={errors.endDate?.message} />
              </div>
            </div>
            <label htmlFor="reason">
              Private reason <span className="muted">(optional)</span>
            </label>
            <textarea
              id="reason"
              rows={4}
              {...register("reason")}
              aria-describedby="reason-help"
              placeholder="Anything your reviewing manager should know?"
            />
            <p className="caption" id="reason-help">
              Visible to you and authorised reviewers. Never shown on the team
              calendar.
            </p>
            {mutation.isError && <ErrorNotice error={mutation.error} />}
            <div className="form-actions">
              <Link to="/requests" className="text-button">
                Back to my requests
              </Link>
              <button
                className="primary"
                disabled={
                  mutation.isPending ||
                  loading ||
                  Boolean(typeError) ||
                  !sharedTypes.some((type) => type.code === code)
                }
              >
                {mutation.isPending ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </fieldset>
        </form>
        <aside className="panel request-summary">
          <p className="eyebrow">YOUR REQUEST AT A GLANCE</p>
          <h2>
            {workingDays(start, end)} <span>working days</span>
          </h2>
          <p className="muted">
            Weekday estimate, including both dates. The server confirms the
            duration and available balance.
          </p>
          <h3>Selected organisations</h3>
          {ids.length ? (
            <ul>
              {memberships
                .filter((item) => ids.includes(item.organisationId))
                .map((item) => (
                  <li key={item.id}>{item.organisationName}</li>
                ))}
            </ul>
          ) : (
            <p className="muted">Choose at least one organisation.</p>
          )}
          <p className="caption">
            Weekends are excluded. Public holidays are included in v1. Each
            organisation's approval remains separate.
          </p>
        </aside>
      </div>
    </>
  );
}
