import { Card, LoadingLabel, Skeleton } from "@/components/ui";

// Shown while the payment is confirmed with Stripe: the shape of the ticket card.
export default function SuccessLoading() {
  return (
    <main id="main" className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <LoadingLabel>Confirming your payment</LoadingLabel>
      <div className="mx-auto max-w-lg">
        <Card className="flex flex-col items-center space-y-5 p-6 sm:p-8">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-sm" />
          <Skeleton className="aspect-[900/1460] w-72 max-w-full rounded-lg" />
          <Skeleton className="h-12 w-48 rounded-md" />
        </Card>
      </div>
    </main>
  );
}
