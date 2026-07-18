import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getTransitOptions } from "@/lib/chat-tools";

export default defineTool({
  name: "get_transit_options",
  title: "Get transit options",
  description:
    "Return public transit and shuttle options departing near the stadium toward a given destination, including next-departure ETA and accessibility.",
  inputSchema: {
    stadium: z.string().describe("Stadium identifier, e.g. MetLife, SoFi, Azteca."),
    toward: z.string().describe("Destination area or neighborhood, e.g. 'Downtown', 'Airport'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ stadium, toward }) => {
    const result = getTransitOptions(stadium, toward);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  },
});
