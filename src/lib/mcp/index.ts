import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getStadiumTelemetry from "./tools/get-stadium-telemetry";
import getWayfindingRoute from "./tools/get-wayfinding-route";
import getTransitOptions from "./tools/get-transit-options";
import getSustainabilityTip from "./tools/get-sustainability-tip";
import listMyThreads from "./tools/list-my-threads";
import getThreadMessages from "./tools/get-thread-messages";

// Direct Supabase issuer — do NOT use the .lovable.cloud proxy form. Read the
// project ref via Vite's inlined literal at build time. The fallback keeps the
// issuer well-formed during the manifest-extract eval; the published build
// substitutes the real ref.
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "stadspear-mcp",
  title: "StadSpear · FIFA 2026 Ops Concierge",
  version: "0.1.0",
  instructions:
    "Tools for the StadSpear FIFA World Cup 2026 stadium operations concierge. Use get_stadium_telemetry, get_wayfinding_route, get_transit_options, and get_sustainability_tip for live stadium context. Use list_my_threads and get_thread_messages to read the signed-in user's saved concierge conversations.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getStadiumTelemetry,
    getWayfindingRoute,
    getTransitOptions,
    getSustainabilityTip,
    listMyThreads,
    getThreadMessages,
  ],
});
