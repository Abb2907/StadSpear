import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { createThread, listThreads } from "@/lib/threads.functions";

export const Route = createFileRoute("/_authenticated/hub/")({
  component: HubIndex,
  head: () => ({
    meta: [
      { title: "Hub · StadSpear Control Tower" },
      { name: "description", content: "Your StadSpear operational hub — multilingual AI concierge threads, live stadium telemetry, and real-time ops decision support." },
      { property: "og:title", content: "Hub · StadSpear Control Tower" },
      { property: "og:description", content: "Multilingual AI concierge threads and live stadium telemetry for FIFA 2026." },
      { property: "og:url", content: "https://stadspear.lovable.app/hub" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://stadspear.lovable.app/hub" }],
  }),
});

function HubIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const threads = await list();
        if (threads && threads.length > 0) {
          navigate({ to: "/hub/$threadId", params: { threadId: threads[0].id } });
          return;
        }
        const t = await create({ data: { role: "fan", language: "en", stadium: "MetLife" } });
        if (t?.id) navigate({ to: "/hub/$threadId", params: { threadId: t.id } });
      } catch (e) {
        console.error("hub init", e);
      }
    })();
  }, [list, create, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Booting the control tower…
    </div>
  );
}
