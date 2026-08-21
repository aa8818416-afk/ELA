-- Migration: Advanced Memory System, Chat Sessions/Messages (7-Day Rolling Retention), and Continuous Synthesis

-- 1. Expand farmer_memory_category enum
ALTER TYPE public.farmer_memory_category ADD VALUE IF NOT EXISTS 'equipment_inventory';
ALTER TYPE public.farmer_memory_category ADD VALUE IF NOT EXISTS 'farm_constraints';
ALTER TYPE public.farmer_memory_category ADD VALUE IF NOT EXISTS 'soil_water_notes';

-- 2. Chat Sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
  title text DEFAULT 'محادثة جديدة',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_farmer ON public.chat_sessions(farmer_id, updated_at DESC);

-- 3. Chat Messages table (7-day rolling window)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  farmer_id uuid NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model', 'system')),
  content text NOT NULL,
  image_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_farmer_created ON public.chat_messages(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages(session_id, created_at ASC);

-- 4. Continuous Synthesis Table (Master Profile & Topic/Field Files)
CREATE TABLE IF NOT EXISTS public.farmer_synthesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid NOT NULL REFERENCES public.farmers(profile_id) ON DELETE CASCADE,
  area_scope text NOT NULL DEFAULT 'general', -- 'general' for Master Profile, or field_id, or topic_slug
  title text,
  summary_content text NOT NULL DEFAULT '',
  work_context text,
  personal_context text,
  top_of_mind text,
  brief_history text,
  key_topics text[] DEFAULT '{}',
  last_synthesized_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_farmer_synthesis_scope UNIQUE (farmer_id, area_scope)
);

CREATE INDEX IF NOT EXISTS idx_farmer_synthesis_farmer ON public.farmer_synthesis(farmer_id, area_scope);

-- 5. Function to automatically cleanup chat messages older than 7 days
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages_7d()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete messages older than 7 days
  DELETE FROM public.chat_messages
  WHERE created_at < (now() - interval '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete sessions that have no messages and were updated more than 7 days ago
  DELETE FROM public.chat_sessions
  WHERE updated_at < (now() - interval '7 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages WHERE chat_messages.session_id = chat_sessions.id
    );
    
  RETURN deleted_count;
END;
$$;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_synthesis ENABLE ROW LEVEL SECURITY;

-- chat_sessions policies
CREATE POLICY "farmer_own_chat_sessions" ON public.chat_sessions
  FOR ALL USING (farmer_id = auth.uid());

CREATE POLICY "admin_all_chat_sessions" ON public.chat_sessions
  FOR ALL USING (public.get_my_role() = 'admin');

-- chat_messages policies
CREATE POLICY "farmer_own_chat_messages" ON public.chat_messages
  FOR ALL USING (farmer_id = auth.uid());

CREATE POLICY "admin_all_chat_messages" ON public.chat_messages
  FOR ALL USING (public.get_my_role() = 'admin');

-- farmer_synthesis policies
CREATE POLICY "farmer_own_synthesis" ON public.farmer_synthesis
  FOR SELECT USING (farmer_id = auth.uid());

CREATE POLICY "admin_all_synthesis" ON public.farmer_synthesis
  FOR ALL USING (public.get_my_role() = 'admin');
