"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Badge } from "@/app/_components/Badge";
import { Button } from "@/app/_components/Button";
import { Card } from "@/app/_components/Card";
import { FormField } from "@/app/_components/FormField";
import { InlineError } from "@/app/_components/InlineError";
import { NameLabel } from "@/app/_components/NameLabel";
import { TextField } from "@/app/_components/TextField";
import { useToast } from "@/app/_components/ToastProvider";
import type { RosterMember } from "@/app/_lib/validation/responses";
import { addMemberSchema, setRoleSchema } from "@/app/_lib/validation/teams";

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "The roster change failed.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function RosterControls({ initialMembers }: { initialMembers: RosterMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const toast = useToast();

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const form = event.currentTarget;
    const parsed = addMemberSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setError(z.prettifyError(parsed.error));
      return;
    }
    setBusyId("add");
    try {
      const created = await requestJson<RosterMember>("/api/teams/members", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setMembers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset();
      toast.push({ variant: "success", message: "Invite sent." });
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Invite failed.");
    } finally {
      setBusyId(undefined);
    }
  }

  async function changeRole(member: RosterMember, role: "LEAD" | "MEMBER") {
    setBusyId(member.id);
    try {
      const updated = await requestJson<RosterMember>(`/api/teams/members/${member.id}/role`, {
        method: "PATCH",
        body: JSON.stringify(setRoleSchema.parse({ role })),
      });
      setMembers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.push({ variant: "success", message: "Role updated." });
    } catch (roleError) {
      toast.push({ variant: "error", message: roleError instanceof Error ? roleError.message : "Role update failed." });
    } finally {
      setBusyId(undefined);
    }
  }

  async function removeMember(member: RosterMember) {
    setBusyId(member.id);
    try {
      await requestJson<void>(`/api/teams/members/${member.id}`, { method: "DELETE" });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast.push({ variant: "success", message: "Access removed. History is retained." });
    } catch (removeError) {
      toast.push({ variant: "error", message: removeError instanceof Error ? removeError.message : "Remove failed." });
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={onAdd} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <FormField label="Name" htmlFor="member-name">
            <TextField id="member-name" name="name" autoComplete="name" />
          </FormField>
          <FormField label="Email" htmlFor="member-email">
            <TextField id="member-email" name="email" type="email" autoComplete="email" />
          </FormField>
          <Button type="submit" isLoading={busyId === "add"}>
            Add member
          </Button>
        </form>
        {error && <InlineError message={error} className="mt-3" />}
      </Card>

      <div className="grid gap-3">
        {members.map((member) => (
          <Card key={member.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <NameLabel name={member.name} role={member.role} />
              <span className="text-sm text-neutral-500">{member.email}</span>
              <Badge variant={member.status === "pending" ? "noUpdate" : "onTrack"}>
                {member.status === "pending" ? "Invite pending" : "Active"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {member.role !== "OWNER_ADMIN" && (
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={busyId === member.id}
                  onClick={() => changeRole(member, member.role === "LEAD" ? "MEMBER" : "LEAD")}
                >
                  Make {member.role === "LEAD" ? "member" : "lead"}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                isLoading={busyId === member.id}
                onClick={() => removeMember(member)}
              >
                Remove access
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

