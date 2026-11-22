-- =====================================================================
-- SynexTax | Migration 0035 | Assistant
-- Questions and notice reply drafts, kept per user: a thread and its
-- messages, visible only to the user who wrote them, in their own firm.
-- The notification feed is global: titles, dates and links read daily from
-- official listing pages. The app role may only read it; the refresh job
-- writes through app.record_assistant_feed_item (SECURITY DEFINER).
-- =====================================================================
SET ROLE synextax_owner;

CREATE TABLE public.assistant_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES public.firms(id),
  user_id     uuid NOT NULL,
  kind        varchar(12) NOT NULL CHECK (kind IN ('QUESTION','NOTICE')),
  title       varchar(200) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, id)
);
CREATE INDEX idx_assistant_threads_user ON public.assistant_threads (firm_id, user_id, updated_at DESC);

CREATE TABLE public.assistant_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL,
  user_id     uuid NOT NULL,
  thread_id   uuid NOT NULL,
  role        varchar(10) NOT NULL CHECK (role IN ('user','assistant')),
  content     text NOT NULL CHECK (length(content) <= 60000),
  citations   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- sections verified against the mapping table
  removed     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- citations removed as unverifiable
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (firm_id, thread_id) REFERENCES public.assistant_threads (firm_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_assistant_messages_thread ON public.assistant_messages (thread_id, created_at);

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.assistant_threads FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE public.assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY p_assistant_threads_owner ON public.assistant_threads FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND user_id = (SELECT app.current_user_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND user_id = (SELECT app.current_user_id()));

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY p_assistant_messages_owner ON public.assistant_messages FOR ALL TO synextax_app
  USING (firm_id = (SELECT app.current_firm_id()) AND user_id = (SELECT app.current_user_id()))
  WITH CHECK (firm_id = (SELECT app.current_firm_id()) AND user_id = (SELECT app.current_user_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_threads, public.assistant_messages TO synextax_app;

-- Global feed: no firm data.
CREATE TABLE public.assistant_feed_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        varchar(10) NOT NULL CHECK (source IN ('CBDT','EFILING','CBIC','GSTC')),
  title         varchar(300) NOT NULL,
  published_on  date,
  link          varchar(1000) NOT NULL CHECK (link ~ '^https?://'),
  body          text CHECK (body IS NULL OR length(body) <= 4000),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, link, title)
);
CREATE INDEX idx_assistant_feed_date ON public.assistant_feed_items (published_on DESC NULLS LAST, first_seen_at DESC);

ALTER TABLE public.assistant_feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_feed_items FORCE ROW LEVEL SECURITY;
CREATE POLICY p_assistant_feed_read ON public.assistant_feed_items FOR SELECT TO synextax_app USING (true);
CREATE POLICY p_assistant_feed_owner ON public.assistant_feed_items FOR ALL TO synextax_owner USING (true) WITH CHECK (true);
GRANT SELECT ON public.assistant_feed_items TO synextax_app;

-- The refresh job's only way to write the feed. Returns true when the item is new.
CREATE FUNCTION app.record_assistant_feed_item(p_source text, p_title text, p_published_on date, p_link text, p_body text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_new boolean;
BEGIN
  INSERT INTO public.assistant_feed_items (source, title, published_on, link, body)
  VALUES (p_source, left(p_title, 300), p_published_on, left(p_link, 1000), left(p_body, 4000))
  ON CONFLICT (source, link, title) DO UPDATE
    SET last_seen_at = now(),
        published_on = COALESCE(public.assistant_feed_items.published_on, EXCLUDED.published_on),
        body = COALESCE(EXCLUDED.body, public.assistant_feed_items.body)
  RETURNING (xmax = 0) INTO v_new;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION app.record_assistant_feed_item(text, text, date, text, text) FROM PUBLIC;
ALTER FUNCTION app.record_assistant_feed_item(text, text, date, text, text) OWNER TO synextax_owner;
GRANT EXECUTE ON FUNCTION app.record_assistant_feed_item(text, text, date, text, text) TO synextax_app;

RESET ROLE;
