
-- =========================================================
-- StadSpear schema
-- =========================================================

-- threads
CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  role TEXT NOT NULL DEFAULT 'fan' CHECK (role IN ('fan','volunteer','ops')),
  stadium TEXT,
  match TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  favorite BOOLEAN NOT NULL DEFAULT false,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX threads_user_updated_idx ON public.threads(user_id, favorite DESC, last_viewed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.threads TO authenticated;
GRANT ALL ON public.threads TO service_role;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own threads" ON public.threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread_created_idx ON public.messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own messages" ON public.messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = messages.thread_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = messages.thread_id AND t.user_id = auth.uid()));

-- telemetry_cache (shared/public operational data)
CREATE TABLE public.telemetry_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stadium TEXT NOT NULL,
  metric TEXT NOT NULL,
  value JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stadium, metric)
);
GRANT SELECT ON public.telemetry_cache TO authenticated;
GRANT ALL ON public.telemetry_cache TO service_role;
ALTER TABLE public.telemetry_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read telemetry" ON public.telemetry_cache FOR SELECT
  TO authenticated USING (true);

-- Seed telemetry
INSERT INTO public.telemetry_cache (stadium, metric, value) VALUES
  ('MetLife','gate_wait', '{"minutes": 12, "trend": "up"}'::jsonb),
  ('MetLife','concourse_density', '{"level": "medium", "percent": 62}'::jsonb),
  ('MetLife','transit_eta', '{"nextTrain": "9 min", "line": "NJ Transit"}'::jsonb),
  ('MetLife','ada_restrooms', '{"available": 8, "closest": "Section 112"}'::jsonb),
  ('MetLife','eco_points', '{"score": 78, "note": "on track"}'::jsonb),
  ('SoFi','gate_wait', '{"minutes": 8, "trend": "steady"}'::jsonb),
  ('SoFi','concourse_density', '{"level": "low", "percent": 34}'::jsonb),
  ('SoFi','transit_eta', '{"nextTrain": "12 min", "line": "Metro K"}'::jsonb),
  ('SoFi','ada_restrooms', '{"available": 10, "closest": "Section 210"}'::jsonb),
  ('SoFi','eco_points', '{"score": 82, "note": "great"}'::jsonb);

-- tool_events
CREATE TABLE public.tool_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','degraded','error')),
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tool_events_user_created_idx ON public.tool_events(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.tool_events TO authenticated;
GRANT ALL ON public.tool_events TO service_role;
ALTER TABLE public.tool_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own tool events" ON public.tool_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tool events" ON public.tool_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ai_gateway_runs
CREATE TABLE public.ai_gateway_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  stream_duration_ms INTEGER,
  finish_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_gateway_runs_user_created_idx ON public.ai_gateway_runs(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.ai_gateway_runs TO authenticated;
GRANT ALL ON public.ai_gateway_runs TO service_role;
ALTER TABLE public.ai_gateway_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own runs" ON public.ai_gateway_runs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own runs" ON public.ai_gateway_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- feedback
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  message_id TEXT,
  rating TEXT NOT NULL CHECK (rating IN ('up','down')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own feedback" ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own feedback" ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER threads_set_updated_at BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
