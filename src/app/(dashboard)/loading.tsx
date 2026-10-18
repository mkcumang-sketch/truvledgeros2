import { CardSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-graphite-200/80 animate-pulse rounded-md" />
          <div className="h-4 w-72 bg-graphite-100 animate-pulse rounded-md" />
        </div>
        <div className="h-10 w-32 bg-graphite-200/80 animate-pulse rounded-lg" />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}
