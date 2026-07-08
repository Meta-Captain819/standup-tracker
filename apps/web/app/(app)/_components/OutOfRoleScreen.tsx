import { EmptyState } from "@/app/_components/EmptyState";

export function OutOfRoleScreen() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <EmptyState
        title="This area isn't available to you"
        description="Your role doesn't include access to this page. If you think this is a mistake, ask your team admin."
      />
    </div>
  );
}
