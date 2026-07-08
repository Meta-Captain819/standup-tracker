import { Skeleton } from "@/app/_components/Skeleton";

export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-calm-base px-6">
      <Skeleton width="12rem" height="1.5rem" />
      <Skeleton width="20rem" height="1rem" />
    </div>
  );
}
