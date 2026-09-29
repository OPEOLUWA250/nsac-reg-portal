import { Card, LoadingLabel, Skeleton } from "@/components/ui";

// Shown while the form's tickets load: the same shape as the first step.
export default function RegisterLoading() {
  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <LoadingLabel>Loading the registration form</LoadingLabel>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="w-full space-y-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
        <Skeleton className="h-5 w-full max-w-md" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-1.5" />
          <Skeleton className="h-1.5" />
          <Skeleton className="h-1.5" />
        </div>
        <Card className="space-y-5 p-5 sm:p-6">
          <Skeleton className="h-6 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          ))}
        </Card>
      </div>
    </main>
  );
}
