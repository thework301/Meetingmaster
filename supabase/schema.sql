-- Meeting Master — Supabase Schema with RLS
-- Run this in the Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team','enterprise')),
  seats_purchased INTEGER NOT NULL DEFAULT 5,
  seats_used INTEGER NOT NULL DEFAULT 0,
  billing_email TEXT NOT NULL,
  stripe_customer_id TEXT,
  data_retention_months INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','viewer')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','team','enterprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour_hex TEXT NOT NULL DEFAULT '#3B82F6',
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour_hex TEXT NOT NULL DEFAULT '#3B82F6',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  organiser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  series_id UUID REFERENCES meeting_series(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  meeting_type TEXT NOT NULL DEFAULT 'standup',
  is_series BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_name TEXT,
  guest_email TEXT,
  is_present BOOLEAN NOT NULL DEFAULT false,
  introduced_at TIMESTAMPTZ,
  speaking_time_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS speaker_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  speaker_label TEXT NOT NULL,
  speaker_name TEXT,
  start_time_seconds FLOAT NOT NULL DEFAULT 0,
  end_time_seconds FLOAT NOT NULL DEFAULT 0,
  text_content TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  ai_summary TEXT NOT NULL DEFAULT '',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  series_id UUID REFERENCES meeting_series(id) ON DELETE SET NULL,
  assigned_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','overdue')),
  escalated BOOLEAN NOT NULL DEFAULT false,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS series_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES meeting_series(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  milestone_text TEXT NOT NULL,
  milestone_type TEXT NOT NULL DEFAULT 'info' CHECK (milestone_type IN ('decision','blocker','blocker_resolved','info')),
  session_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  position_order INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent'
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_company_id ON meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_organiser_id ON meetings(organiser_id);
CREATE INDEX IF NOT EXISTS idx_meetings_series_id ON meetings(series_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON meeting_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_speaker_segments_transcript_id ON speaker_segments(transcript_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assigned_to ON action_items(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_series_milestones_series_id ON series_milestones(series_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_meeting_id ON agenda_items(meeting_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get the company_id of the current user
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get the role of the current user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- COMPANIES — users can read their own company; admins can update
CREATE POLICY "Users can view own company" ON companies
  FOR SELECT USING (id = get_user_company_id());

CREATE POLICY "Admins can update company" ON companies
  FOR UPDATE USING (id = get_user_company_id() AND get_user_role() = 'admin');

-- USERS — can read same-company users; can update own record
CREATE POLICY "Users can view company members" ON users
  FOR SELECT USING (company_id = get_user_company_id());

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can update any user in company" ON users
  FOR UPDATE USING (company_id = get_user_company_id() AND get_user_role() = 'admin');

CREATE POLICY "Service role can insert users" ON users
  FOR INSERT WITH CHECK (true);

-- MEETINGS — company-scoped; only organiser or admin can modify
CREATE POLICY "Company members can view meetings" ON meetings
  FOR SELECT USING (company_id = get_user_company_id());

CREATE POLICY "Users can create meetings" ON meetings
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Organiser or admin can update meeting" ON meetings
  FOR UPDATE USING (
    company_id = get_user_company_id() AND
    (organiser_id = auth.uid() OR get_user_role() = 'admin')
  );

CREATE POLICY "Organiser or admin can delete meeting" ON meetings
  FOR DELETE USING (
    company_id = get_user_company_id() AND
    (organiser_id = auth.uid() OR get_user_role() = 'admin')
  );

-- MEETING_ATTENDEES — company-scoped via meeting
CREATE POLICY "Company members can view attendees" ON meeting_attendees
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Meeting organiser can manage attendees" ON meeting_attendees
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND
        m.company_id = get_user_company_id() AND
        (m.organiser_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- TRANSCRIPTS — company-scoped via meeting
CREATE POLICY "Company members can view transcripts" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Organiser or admin can manage transcripts" ON transcripts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND
        m.company_id = get_user_company_id() AND
        (m.organiser_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- SPEAKER_SEGMENTS — via transcript -> meeting -> company
CREATE POLICY "Company members can view speaker segments" ON speaker_segments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transcripts t
      JOIN meetings m ON m.id = t.meeting_id
      WHERE t.id = transcript_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Organiser or admin can manage segments" ON speaker_segments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transcripts t
      JOIN meetings m ON m.id = t.meeting_id
      WHERE t.id = transcript_id AND
        m.company_id = get_user_company_id() AND
        (m.organiser_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- SUMMARIES — company-scoped
CREATE POLICY "Company members can view summaries" ON summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Organiser or admin can manage summaries" ON summaries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND
        m.company_id = get_user_company_id() AND
        (m.organiser_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- ACTION_ITEMS — user sees their own or company admin sees all
CREATE POLICY "Users can view own action items" ON action_items
  FOR SELECT USING (
    assigned_to_user_id = auth.uid() OR
    assigned_by_user_id = auth.uid() OR
    get_user_role() = 'admin'
  );

CREATE POLICY "Users can create action items in company meetings" ON action_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Assigned user or admin can update action item" ON action_items
  FOR UPDATE USING (
    assigned_to_user_id = auth.uid() OR get_user_role() = 'admin'
  );

-- FOLDERS — owner or shared within company
CREATE POLICY "Users can view own and shared folders" ON folders
  FOR SELECT USING (
    company_id = get_user_company_id() AND
    (owner_id = auth.uid() OR is_shared = true OR get_user_role() = 'admin')
  );

CREATE POLICY "Users can manage own folders" ON folders
  FOR ALL USING (owner_id = auth.uid() OR get_user_role() = 'admin');

-- MEETING_SERIES — company-scoped
CREATE POLICY "Company members can view series" ON meeting_series
  FOR SELECT USING (company_id = get_user_company_id());

CREATE POLICY "Users can create series" ON meeting_series
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "Admins can manage series" ON meeting_series
  FOR ALL USING (company_id = get_user_company_id() AND get_user_role() = 'admin');

-- SERIES_MILESTONES — via series -> company
CREATE POLICY "Company members can view milestones" ON series_milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_series ms
      WHERE ms.id = series_id AND ms.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Organiser or admin can manage milestones" ON series_milestones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meeting_series ms
      WHERE ms.id = series_id AND ms.company_id = get_user_company_id()
    ) AND (
      EXISTS (
        SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.organiser_id = auth.uid()
      ) OR get_user_role() = 'admin'
    )
  );

-- AGENDA_ITEMS — via meeting -> company
CREATE POLICY "Company members can view agenda items" ON agenda_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND m.company_id = get_user_company_id()
    )
  );

CREATE POLICY "Organiser or admin can manage agenda" ON agenda_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_id AND
        m.company_id = get_user_company_id() AND
        (m.organiser_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- AUDIT_LOGS — admin only
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    company_id = get_user_company_id() AND get_user_role() = 'admin'
  );

CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

-- EMAIL_LOGS — admin only
CREATE POLICY "Admins can view email logs" ON email_logs
  FOR SELECT USING (get_user_role() = 'admin');

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Run these via Supabase Dashboard > Storage (or REST API):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update user last_active_at
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET last_active_at = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-increment series session_count
CREATE OR REPLACE FUNCTION increment_series_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.series_id IS NOT NULL AND NEW.status = 'completed' AND
     (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE meeting_series
    SET session_count = session_count + 1
    WHERE id = NEW.series_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_increment_series
  AFTER UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION increment_series_count();

-- Mark action items overdue
CREATE OR REPLACE FUNCTION mark_overdue_action_items()
RETURNS void AS $$
BEGIN
  UPDATE action_items
  SET status = 'overdue'
  WHERE status = 'open'
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
