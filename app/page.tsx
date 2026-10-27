import { redirect } from "next/navigation";

/**
 * There is no public landing page: `proxy.ts` sends signed-out visitors to /login
 * and signed-in users to the dashboard. This is only a fallback for the same rule.
 */
export default function Home() {
  redirect("/dashboard");
}
