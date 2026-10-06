import { notFound } from "next/navigation";
import { DemoPhone } from "../../../components/demo-phone";
export default async function DemoPage({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  if (user !== "a" && user !== "b") notFound();
  return <DemoPhone user={user} />;
}
