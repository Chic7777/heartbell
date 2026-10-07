import { notFound } from "next/navigation";
import { JourneyShell } from "../../../components/journey/app-shell";
export default async function DemoPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  if (user !== "a" && user !== "b") notFound();
  return <JourneyShell user={user} />;
}
