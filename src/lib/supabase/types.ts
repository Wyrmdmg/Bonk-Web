export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      blocked_words: {
        Row: {
          word: string;
        };
        Insert: {
          word: string;
        };
        Update: {
          word?: string;
        };
        Relationships: [];
      };
      bonk_bans: {
        Row: {
          banned_by: string;
          bonk_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          banned_by: string;
          bonk_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          banned_by?: string;
          bonk_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonk_bans_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: false;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
        ];
      };
      bonk_members: {
        Row: {
          bonk_id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          bonk_id: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          bonk_id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonk_members_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: false;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bonk_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bonk_presence: {
        Row: {
          bonk_id: string;
          last_seen: string;
          user_id: string;
        };
        Insert: {
          bonk_id: string;
          last_seen?: string;
          user_id: string;
        };
        Update: {
          bonk_id?: string;
          last_seen?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonk_presence_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: false;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bonk_presence_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bonk_requests: {
        Row: {
          bonk_id: string;
          created_at: string;
          id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          bonk_id: string;
          created_at?: string;
          id?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          bonk_id?: string;
          created_at?: string;
          id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonk_requests_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: false;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bonk_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bonk_secrets: {
        Row: {
          bonk_id: string;
          created_at: string;
          password_hash: string;
        };
        Insert: {
          bonk_id: string;
          created_at?: string;
          password_hash: string;
        };
        Update: {
          bonk_id?: string;
          created_at?: string;
          password_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonk_secrets_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: true;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
        ];
      };
      bonks: {
        Row: {
          afk_kick: boolean;
          auto_restart: boolean;
          break_min: number;
          chat_enabled: boolean;
          chat_slow_mode_sec: number;
          coffee_cram_vc: boolean;
          created_at: string;
          current_cycle: number;
          cycle_paused_at: string | null;
          cycle_started_at: string | null;
          cycle_state: string;
          ended_at: string | null;
          focus_min: number;
          host_id: string;
          id: string;
          join_mode: string;
          name: string;
          restart_at: string | null;
          status: string;
          target_cycles: number;
          timer_type: string;
        };
        Insert: {
          afk_kick?: boolean;
          auto_restart?: boolean;
          break_min?: number;
          chat_enabled?: boolean;
          chat_slow_mode_sec?: number;
          coffee_cram_vc?: boolean;
          created_at?: string;
          current_cycle?: number;
          cycle_paused_at?: string | null;
          cycle_started_at?: string | null;
          cycle_state?: string;
          ended_at?: string | null;
          focus_min?: number;
          host_id: string;
          id?: string;
          join_mode?: string;
          name: string;
          restart_at?: string | null;
          status?: string;
          target_cycles?: number;
          timer_type?: string;
        };
        Update: {
          afk_kick?: boolean;
          auto_restart?: boolean;
          break_min?: number;
          chat_enabled?: boolean;
          chat_slow_mode_sec?: number;
          coffee_cram_vc?: boolean;
          created_at?: string;
          current_cycle?: number;
          cycle_paused_at?: string | null;
          cycle_started_at?: string | null;
          cycle_state?: string;
          ended_at?: string | null;
          focus_min?: number;
          host_id?: string;
          id?: string;
          join_mode?: string;
          name?: string;
          restart_at?: string | null;
          status?: string;
          target_cycles?: number;
          timer_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bonks_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deleted_emails: {
        Row: {
          deleted_at: string;
          email: string;
        };
        Insert: {
          deleted_at?: string;
          email: string;
        };
        Update: {
          deleted_at?: string;
          email?: string;
        };
        Relationships: [];
      };
      deleted_usernames: {
        Row: {
          deleted_at: string;
          username: string;
        };
        Insert: {
          deleted_at?: string;
          username: string;
        };
        Update: {
          deleted_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      email_send_log: {
        Row: {
          created_at: string;
          error_message: string | null;
          id: string;
          message_id: string | null;
          metadata: Json | null;
          recipient_email: string;
          status: string;
          template_name: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          recipient_email: string;
          status: string;
          template_name: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          recipient_email?: string;
          status?: string;
          template_name?: string;
        };
        Relationships: [];
      };
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number;
          batch_size: number;
          id: number;
          retry_after_until: string | null;
          send_delay_ms: number;
          transactional_email_ttl_minutes: number;
          updated_at: string;
        };
        Insert: {
          auth_email_ttl_minutes?: number;
          batch_size?: number;
          id?: number;
          retry_after_until?: string | null;
          send_delay_ms?: number;
          transactional_email_ttl_minutes?: number;
          updated_at?: string;
        };
        Update: {
          auth_email_ttl_minutes?: number;
          batch_size?: number;
          id?: number;
          retry_after_until?: string | null;
          send_delay_ms?: number;
          transactional_email_ttl_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_unsubscribe_tokens: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          token: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          token: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          token?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
      focus_sessions: {
        Row: {
          awarded_at: string | null;
          bonk_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          planned_seconds: number;
          started_at: string;
          user_id: string;
        };
        Insert: {
          awarded_at?: string | null;
          bonk_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          planned_seconds: number;
          started_at?: string;
          user_id: string;
        };
        Update: {
          awarded_at?: string | null;
          bonk_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          planned_seconds?: number;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "focus_sessions_bonk_id_fkey";
            columns: ["bonk_id"];
            isOneToOne: false;
            referencedRelation: "bonks";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_cooldowns: {
        Row: {
          until: string;
          user_id: string;
        };
        Insert: {
          until: string;
          user_id: string;
        };
        Update: {
          until?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_cooldowns_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title: string;
          type?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profile_link_codes: {
        Row: {
          code: string;
          created_at: string;
          expires_at: string;
          user_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          expires_at: string;
          user_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          expires_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profile_secrets: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          recovery_code_hash: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id: string;
          recovery_code_hash: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          recovery_code_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_secrets_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          coins: number;
          created_at: string;
          current_streak: number;
          discord_id: string | null;
          display_name: string;
          id: string;
          last_focus_date: string | null;
          last_seen: string | null;
          longest_streak: number;
          status: string;
          username: string;
          xp: number;
        };
        Insert: {
          avatar_url?: string | null;
          coins?: number;
          created_at?: string;
          current_streak?: number;
          discord_id?: string | null;
          display_name: string;
          id: string;
          last_focus_date?: string | null;
          last_seen?: string | null;
          longest_streak?: number;
          status?: string;
          username: string;
          xp?: number;
        };
        Update: {
          avatar_url?: string | null;
          coins?: number;
          created_at?: string;
          current_streak?: number;
          discord_id?: string | null;
          display_name?: string;
          id?: string;
          last_focus_date?: string | null;
          last_seen?: string | null;
          longest_streak?: number;
          status?: string;
          username?: string;
          xp?: number;
        };
        Relationships: [];
      };
      suppressed_emails: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          metadata: Json | null;
          reason: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          metadata?: Json | null;
          reason: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          metadata?: Json | null;
          reason?: string;
        };
        Relationships: [];
      };
      todos: {
        Row: {
          created_at: string;
          done: boolean;
          id: string;
          is_public: boolean;
          text: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          done?: boolean;
          id?: string;
          is_public?: boolean;
          text: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          id?: string;
          is_public?: boolean;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_badges: {
        Row: {
          badge_key: string;
          created_at: string;
          equipped: boolean;
          expires_at: string;
          id: string;
          purchased_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          badge_key: string;
          created_at?: string;
          equipped?: boolean;
          expires_at: string;
          id?: string;
          purchased_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          badge_key?: string;
          created_at?: string;
          equipped?: boolean;
          expires_at?: string;
          id?: string;
          purchased_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_foods: {
        Row: {
          custom_name: string | null;
          food_key: string;
          id: string;
          obtained_at: string;
          user_id: string;
        };
        Insert: {
          custom_name?: string | null;
          food_key: string;
          id?: string;
          obtained_at?: string;
          user_id: string;
        };
        Update: {
          custom_name?: string | null;
          food_key?: string;
          id?: string;
          obtained_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string };
        Returns: boolean;
      };
      email_queue_dispatch: { Args: never; Returns: undefined };
      enqueue_email: {
        Args: { payload: Json; queue_name: string };
        Returns: number;
      };
      equip_badge: { Args: { _badge_key: string }; Returns: boolean };
      get_equipped_badges: {
        Args: { _user_ids: string[] };
        Returns: {
          badge_key: string;
          expires_at: string;
          user_id: string;
        }[];
      };
      get_my_link_code: {
        Args: never;
        Returns: {
          code: string;
          expires_at: string;
        }[];
      };
      move_to_dlq: {
        Args: {
          dlq_name: string;
          message_id: number;
          payload: Json;
          source_queue: string;
        };
        Returns: number;
      };
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
