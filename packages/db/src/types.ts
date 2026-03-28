// Types générés depuis le schéma Supabase
// Regénérer avec : pnpm db:generate

export type PCBStatus =
  | 'INITIAL'
  | 'SCHEMA_DONE'
  | 'PLACEMENT_DONE'
  | 'ROUTING_DONE'
  | 'DRC_CLEAN'
  | 'PCB_LIVRÉ';

export type Plan = 'free' | 'maker' | 'pro' | 'enterprise';

export type FootprintSource =
  | 'kicad_official'
  | 'snapmagic'
  | 'octopart'
  | 'ai_generated';

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          status: PCBStatus;
          pcb_state: Record<string, unknown> | null;
          iteration_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          status?: PCBStatus;
          pcb_state?: Record<string, unknown> | null;
          iteration_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          status?: PCBStatus;
          pcb_state?: Record<string, unknown> | null;
          iteration_count?: number;
          updated_at?: string;
        };
      };
      credits: {
        Row: {
          id: string;
          user_id: string;
          balance: number;
          plan: Plan;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          balance?: number;
          plan?: Plan;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          plan?: Plan;
          updated_at?: string;
        };
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          action: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          action: string;
          amount: number;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      footprints: {
        Row: {
          id: string;
          user_id: string | null;
          is_community: boolean;
          name: string;
          part_number: string | null;
          source: FootprintSource | null;
          kicad_mod: string | null;
          validated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          is_community?: boolean;
          name: string;
          part_number?: string | null;
          source?: FootprintSource | null;
          kicad_mod?: string | null;
          validated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          is_community?: boolean;
          kicad_mod?: string | null;
          validated?: boolean;
          updated_at?: string;
        };
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
    };
    Functions: {
      deduct_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_action: string;
          p_project_id?: string;
        };
        Returns: void;
      };
      add_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_action: string;
        };
        Returns: void;
      };
    };
  };
}
