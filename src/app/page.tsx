import { redirect } from "next/navigation";
import { getSession, isActive } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  redirect(isActive(session) ? "/dashboard" : "/login");
}
