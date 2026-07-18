import { createFileRoute } from "@tanstack/react-router";
import { HubShell } from "@/components/stadspear/HubShell";

export const Route = createFileRoute("/_authenticated/hub/$threadId")({
  component: HubPage,
  head: ({ params }) => ({
    meta: [
      { title: "Thread · StadSpear Hub" },
      { name: "description", content: "An active StadSpear concierge thread with live stadium telemetry, transit, accessibility, and sustainability tools." },
      { property: "og:title", content: "Thread · StadSpear Hub" },
      { property: "og:description", content: "Multilingual AI concierge thread with live stadium ops tools." },
      { property: "og:url", content: `https://stadspear.lovable.app/hub/${params.threadId}` },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `https://stadspear.lovable.app/hub/${params.threadId}` }],
  }),
});

function HubPage() {
  const { threadId } = Route.useParams();
  return <HubShell threadId={threadId} />;
}
