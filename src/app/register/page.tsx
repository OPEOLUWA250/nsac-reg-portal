import { permanentRedirect } from "next/navigation";

// The form lives on the home page now. Old links (emails, flyers, a Stripe
// session started before the move) keep working, query string included.
export default async function RegisterRedirect(props: PageProps<"/register">) {
  const query = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  permanentRedirect(qs ? `/?${qs}` : "/");
}
