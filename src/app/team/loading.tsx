import { CardSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function TeamLoading() {
  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-graphite-200/80 animate-pulse rounded-md" />
          <div className="h-4 w-72 bg-graphite-100 animate-pulse rounded-md" />
        </div>
        <div className="h-10 w-36 bg-graphite-200/80 animate-pulse rounded-lg" />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
