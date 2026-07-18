import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/stadspear/HubShell";

export const Route = createFileRoute("/_authenticated/hub/$threadId")({
  component: HubPage,
});

function HubPage() {
  const { threadId } = Route.useParams();
  return <HubShell threadId={threadId} />;
}
