import { EmptyState } from "@/app/_components/EmptyState";

export default function MarketingHomePage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <EmptyState
        title="The welcome page is coming in a later phase"
        description="This route exists so the app shell and routing structure can be verified end to end."
      />
    </div>
  );
}
