import { redirect } from "next/navigation";
import { isStepId } from "@/lib/will/steps";
import { loadWillForEditing } from "@/server/services/wills";
import { requireUser } from "@/server/session";

export default async function WillIndexPage({ params }: { params: Promise<{ willId: string }> }) {
  const { willId } = await params;
  const actor = await requireUser(`/dashboard/wills/${willId}`);
  const { will } = await loadWillForEditing(actor, willId).catch(() => redirect("/dashboard"));
  redirect(`/dashboard/wills/${willId}/${isStepId(will.currentStep) ? will.currentStep : "about"}`);
}
