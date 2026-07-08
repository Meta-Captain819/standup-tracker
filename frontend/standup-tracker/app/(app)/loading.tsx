import { Skeleton } from "@/app/_components/Skeleton";

export default function AppLoading() {
  return (
    <div className="flex min-h-screen">
      <div className="flex h-full w-60 shrink-0 flex-col gap-3 bg-neutral-900 px-4 py-6">
        <Skeleton width="70%" height="1.25rem" rounded="md" className="bg-neutral-700" />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="2.25rem" rounded="pill" className="bg-neutral-800" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="border-b border-neutral-200 bg-surface px-6 py-4 sm:px-8">
          <Skeleton width="8rem" height="1.5rem" />
        </div>
        <div className="flex flex-1 flex-col gap-4 bg-calm-base p-6 sm:p-8">
          <Skeleton height="8rem" rounded="2xl" />
          <Skeleton height="8rem" rounded="2xl" />
        </div>
      </div>
    </div>
  );
}
