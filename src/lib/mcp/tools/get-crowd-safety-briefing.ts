import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getCrowdSafetyBriefing } from "@/lib/chat-tools";

export default defineTool({
  name: "get_crowd_safety_briefing",
  title: "Get crowd-safety briefing",
  description:
    "Return a crowd-safety briefing for a stadium zone: density level, choke-point flag, ADA/accessibility guidance, and a recommended operational action. Falls back to a conservative advisory when the live density feed is stale.",
  inputSchema: {
    stadium: z.string().describe("Stadium identifier, e.g. MetLife, SoFi, Azteca."),
    zone: z
      .string()
      .describe("Zone or gate, e.g. 'Gate B', 'North concourse', 'Section 210'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ stadium, zone }) => {
    const result = getCrowdSafetyBriefing(stadium, zone);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  },
});
