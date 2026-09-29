import { Card, LoadingLabel, Skeleton } from "@/components/ui";

export default function FlyerLoading() {
  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <LoadingLabel>Loading the flyer maker</LoadingLabel>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card className="order-2 space-y-5 p-5 sm:p-6 lg:order-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-md" />
              </div>
            ))}
          </Card>
          <Skeleton className="order-1 mx-auto aspect-[4/5] w-full max-w-md rounded-lg lg:order-2" />
        </div>
      </div>
    </main>
  );
}
