import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getSustainabilityTip } from "@/lib/chat-tools";

export default defineTool({
  name: "get_sustainability_tip",
  title: "Get sustainability tip",
  description:
    "Return an actionable, stadium-specific sustainability tip (recycling, hydration stations, low-impact transit).",
  inputSchema: {
    stadium: z.string().describe("Stadium identifier, e.g. MetLife, SoFi, Azteca."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ stadium }) => {
    const result = getSustainabilityTip(stadium);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  },
});
