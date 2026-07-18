import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getWayfindingRoute } from "@/lib/chat-tools";

export default defineTool({
  name: "get_wayfinding_route",
  title: "Get in-stadium walking route",
  description:
    "Compute a step-by-step walking route inside the stadium between two landmarks (gates, sections, amenities). Marks the route as degraded with a best-effort guide when the live routing service is unavailable.",
  inputSchema: {
    from: z.string().describe("Origin, e.g. 'Gate A', 'Section 112', 'Main entrance'."),
    to: z.string().describe("Destination, e.g. 'Section 218', 'ADA restroom', 'Team store'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ from, to }) => {
    const result = getWayfindingRoute(from, to);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  },
});
