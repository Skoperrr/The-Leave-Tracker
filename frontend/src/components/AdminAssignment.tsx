import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../api/endpoints";
import { useOrganisation } from "../auth/OrganizationProvider";
import { useApiQuery, useRefreshLeave } from "../hooks/queries";
import type { Membership } from "../types/api";
import { ErrorNotice, FieldError } from "./ui";
const assignmentSchema = z.object({
  email: z.string().trim().email("Enter the confirmed account's email."),
  managerMembershipId: z.string().optional(),
});
const allocationSchema = z.object({
  membershipId: z.string().min(1, "Choose a member."),
  leaveTypeId: z.string().min(1, "Choose a leave type."),
  year: z.coerce.number().int().min(2000).max(9999),
  allocatedDays: z.coerce
    .number({ invalid_type_error: "Enter allocated days." })
    .min(0, "Days cannot be negative.")
    .max(999999.99)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      "Use at most two decimal places.",
    ),
});
export function AdminAssignment({ members }: { members: Membership[] }) {
  const { membership } = useOrganisation();
  const org = membership.organisationId;
  const refresh = useRefreshLeave();
  const types = useApiQuery(["leave-types", org], (signal) =>
    api.leaveTypes(org, signal),
  );
  const assignment = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { email: "", managerMembershipId: "" },
  });
  const allocation = useForm<z.infer<typeof allocationSchema>>({
    resolver: zodResolver(allocationSchema),
    defaultValues: {
      membershipId: "",
      leaveTypeId: "",
      year: new Date().getFullYear(),
    },
  });
  const assign = useMutation({
    mutationFn: (values: z.infer<typeof assignmentSchema>) =>
      api.assignMembership({
        organisationId: org,
        email: values.email.toLowerCase(),
        ...(values.managerMembershipId
          ? { managerMembershipId: values.managerMembershipId }
          : {}),
      }),
    onSuccess: async () => {
      assignment.reset();
      await refresh();
    },
  });
  const allocate = useMutation({
    mutationFn: (values: z.infer<typeof allocationSchema>) =>
      api.allocate({ organisationId: org, ...values }),
    onSuccess: refresh,
  });
  const active = members.filter((member) => member.active);
  return (
    <div className="admin-tools">
      <section className="panel">
        <h2>Assign organisation access</h2>
        <p>
          Assign employee access to an existing confirmed account that has
          completed its profile. This does not change roles or reactivate an
          existing membership.
        </p>
        <form
          noValidate
          onSubmit={assignment.handleSubmit((values) => {
            if (!assign.isPending) assign.mutate(values);
          })}
        >
          <fieldset disabled={assign.isPending}>
            <label htmlFor="assign-email">Account email</label>
            <input
              id="assign-email"
              type="email"
              {...assignment.register("email")}
              aria-invalid={Boolean(assignment.formState.errors.email)}
            />
            <FieldError
              id="assign-email-error"
              message={assignment.formState.errors.email?.message}
            />
            <label htmlFor="assign-manager">Manager (optional)</label>
            <select
              id="assign-manager"
              {...assignment.register("managerMembershipId")}
            >
              <option value="">Not assigned</option>
              {active
                .filter(
                  (member) =>
                    member.role === "MANAGER" || member.role === "ADMIN",
                )
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.role.toLowerCase()} · {member.id}
                  </option>
                ))}
            </select>
            {assign.isError && <ErrorNotice error={assign.error} />}
            {assign.isSuccess && (
              <p role="status">
                Employee access assigned. Create a leave allocation below.
              </p>
            )}
            <button className="primary">
              {assign.isPending ? "Assigning…" : "Assign employee access"}
            </button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h2>Create leave allocation</h2>
        <p>
          Set an explicit entitlement for a member, leave type and year.
          Existing allocations are not overwritten.
        </p>
        <form
          noValidate
          onSubmit={allocation.handleSubmit((values) => {
            if (!allocate.isPending) allocate.mutate(values);
          })}
        >
          <fieldset disabled={allocate.isPending}>
            <label htmlFor="allocation-member">Member</label>
            <select
              id="allocation-member"
              {...allocation.register("membershipId")}
            >
              <option value="">Choose a member</option>
              {active.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.role.toLowerCase()} · {member.id}
                </option>
              ))}
            </select>
            <FieldError
              id="allocation-member-error"
              message={allocation.formState.errors.membershipId?.message}
            />
            <label htmlFor="allocation-type">Leave type</label>
            <select
              id="allocation-type"
              {...allocation.register("leaveTypeId")}
            >
              <option value="">Choose a leave type</option>
              {types.data?.data.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <FieldError
              id="allocation-type-error"
              message={allocation.formState.errors.leaveTypeId?.message}
            />
            {types.isError && (
              <ErrorNotice
                error={types.error}
                retry={() => {
                  void types.refetch();
                }}
              />
            )}
            <div className="form-grid">
              <div>
                <label htmlFor="allocation-year">Policy year</label>
                <input
                  id="allocation-year"
                  type="number"
                  min={2000}
                  max={9999}
                  {...allocation.register("year")}
                />
                <FieldError
                  id="allocation-year-error"
                  message={allocation.formState.errors.year?.message}
                />
              </div>
              <div>
                <label htmlFor="allocation-days">Allocated days</label>
                <input
                  id="allocation-days"
                  type="number"
                  min={0}
                  step="0.01"
                  {...allocation.register("allocatedDays", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  id="allocation-days-error"
                  message={allocation.formState.errors.allocatedDays?.message}
                />
              </div>
            </div>
            {allocate.isError && <ErrorNotice error={allocate.error} />}
            {allocate.isSuccess && (
              <p role="status">Leave allocation created.</p>
            )}
            <button
              className="primary"
              disabled={!types.data || active.length === 0}
            >
              {allocate.isPending ? "Creating…" : "Create allocation"}
            </button>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
