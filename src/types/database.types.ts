export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'user' | 'viewer';
export type UserPlan = 'free' | 'pro' | 'team' | 'enterprise';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed';
export type ActionItemStatus = 'open' | 'done' | 'overdue';
export type MilestoneType = 'decision' | 'blocker' | 'blocker_resolved' | 'info';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          avatar_url: string | null;
          company_id: string;
          role: UserRole;
          plan: UserPlan;
          created_at: string;
          last_active_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      companies: {
        Row: {
          id: string;
          name: string;
          plan: UserPlan;
          seats_purchased: number;
          seats_used: number;
          billing_email: string;
          stripe_customer_id: string | null;
          data_retention_months: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['companies']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
      };
      meetings: {
        Row: {
          id: string;
          title: string;
          company_id: string;
          organiser_id: string;
          folder_id: string | null;
          series_id: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          meeting_type: string;
          is_series: boolean;
          status: MeetingStatus;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meetings']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['meetings']['Insert']>;
      };
      meeting_attendees: {
        Row: {
          id: string;
          meeting_id: string;
          user_id: string | null;
          guest_name: string | null;
          guest_email: string | null;
          is_present: boolean;
          introduced_at: string | null;
          speaking_time_seconds: number;
        };
        Insert: Omit<Database['public']['Tables']['meeting_attendees']['Row'], never>;
        Update: Partial<Database['public']['Tables']['meeting_attendees']['Insert']>;
      };
      transcripts: {
        Row: {
          id: string;
          meeting_id: string;
          full_text: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transcripts']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['transcripts']['Insert']>;
      };
      speaker_segments: {
        Row: {
          id: string;
          transcript_id: string;
          speaker_label: string;
          speaker_name: string | null;
          start_time_seconds: number;
          end_time_seconds: number;
          text_content: string;
        };
        Insert: Omit<Database['public']['Tables']['speaker_segments']['Row'], never>;
        Update: Partial<Database['public']['Tables']['speaker_segments']['Insert']>;
      };
      summaries: {
        Row: {
          id: string;
          meeting_id: string;
          ai_summary: string;
          generated_at: string;
          sent_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['summaries']['Row'], 'generated_at'>;
        Update: Partial<Database['public']['Tables']['summaries']['Insert']>;
      };
      action_items: {
        Row: {
          id: string;
          meeting_id: string;
          series_id: string | null;
          assigned_to_user_id: string;
          assigned_by_user_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          status: ActionItemStatus;
          escalated: boolean;
          escalated_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['action_items']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['action_items']['Insert']>;
      };
      folders: {
        Row: {
          id: string;
          company_id: string;
          owner_id: string;
          name: string;
          colour_hex: string;
          is_shared: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['folders']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['folders']['Insert']>;
      };
      meeting_series: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          colour_hex: string;
          started_at: string;
          session_count: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meeting_series']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['meeting_series']['Insert']>;
      };
      series_milestones: {
        Row: {
          id: string;
          series_id: string;
          meeting_id: string;
          milestone_text: string;
          milestone_type: MilestoneType;
          session_number: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['series_milestones']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['series_milestones']['Insert']>;
      };
      agenda_items: {
        Row: {
          id: string;
          meeting_id: string;
          title: string;
          duration_minutes: number;
          owner_user_id: string | null;
          position_order: number;
          completed: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['agenda_items']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['agenda_items']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          company_id: string;
          actor_user_id: string;
          action: string;
          target_table: string;
          target_id: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
      email_logs: {
        Row: {
          id: string;
          to_email: string;
          subject: string;
          type: string;
          meeting_id: string | null;
          sent_at: string;
          status: string;
        };
        Insert: Omit<Database['public']['Tables']['email_logs']['Row'], 'sent_at'>;
        Update: Partial<Database['public']['Tables']['email_logs']['Insert']>;
      };
    };
  };
}
