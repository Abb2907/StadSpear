ALTER TABLE public.telemetry_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_cache;