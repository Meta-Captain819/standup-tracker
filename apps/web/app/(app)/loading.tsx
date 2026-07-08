import { Skeleton } from "@/app/_components/Skeleton";

export default function AppLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Skeleton height="8rem" rounded="2xl" />
      <Skeleton height="8rem" rounded="2xl" />
      <Skeleton height="8rem" rounded="2xl" />
    </div>
  );
}
