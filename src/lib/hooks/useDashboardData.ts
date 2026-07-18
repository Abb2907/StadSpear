import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStadiumDashboard } from "@/lib/dashboard.functions";

/**
 * Pure telemetry-fetch hook for the ops dashboard.
 *
 * Decoupled from layout concerns (headers, charts, filters) so the dashboard
 * component tree stays a thin presentation layer over this data source and the
 * hook can be reused (dashboard, drilldown, tests, incident replays).
 *
 * @param stadium  Stadium id (or "all" for cross-stadium view).
 * @param windowMin  Time window in minutes. Bucketing is derived automatically.
 */
export function useDashboardData(stadium: string, windowMin: number) {
  const dashFn = useServerFn(getStadiumDashboard);
  const bucketMinutes = windowMin >= 240 ? 15 : windowMin >= 60 ? 5 : 1;
  return useQuery({
    queryKey: ["dashboard", stadium, windowMin],
    queryFn: () =>
      dashFn({
        data: {
          stadium: stadium === "all" ? undefined : stadium,
          sinceMinutes: windowMin,
          bucketMinutes,
        },
      }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
