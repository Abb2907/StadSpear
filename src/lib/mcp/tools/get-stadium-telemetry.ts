import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getStadiumTelemetry } from "@/lib/chat-tools";

export default defineTool({
  name: "get_stadium_telemetry",
  title: "Get stadium telemetry",
  description:
    "Return the latest cached telemetry (crowd density, gate wait times, transit ETA, ADA restroom availability, sustainability score) for a FIFA 2026 host stadium. Falls back to best-effort static values when live telemetry is unavailable.",
  inputSchema: {
    stadium: z
      .string()
      .describe("Stadium identifier, e.g. MetLife, SoFi, Azteca, Lumen."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stadium }) => {
    const result = await getStadiumTelemetry(stadium);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  },
});
