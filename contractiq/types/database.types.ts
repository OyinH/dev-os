// Hand-written to match docs/specs/supabase-schema.sql + supabase/rls-policies.sql.
// Once the Supabase project exists, regenerate with:
//   supabase gen types typescript --project-id <ref> > types/database.types.ts
// and reconcile any drift against this file.
//
// Every table/view below declares `Relationships: []` even where a real FK
// exists (e.g. contracts.user_id -> auth.users.id) because @supabase/postgrest-js's
// GenericTable/GenericView types require the field to be present, and the
// generated client only uses it for the `select('*, other_table(*)')`
// embedded-resource syntax, which this codebase does not use — every query
// in the specs fetches one table at a time and joins in application code.

export interface Database {
  public: {
    Tables: {
      contracts: {
        Row: {
          id: string
          user_id: string
          title: string
          contract_type: 'NDA' | 'MSA'
          detected_contract_type: 'NDA' | 'MSA' | null
          file_path: string | null
          contract_text: string
          page_count: number
          token_count: number | null
          status: 'processing' | 'completed' | 'error'
          error_message: string | null
          processing_started_at: string | null
          processing_completed_at: string | null
          last_accessed_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          contract_type: 'NDA' | 'MSA'
          detected_contract_type?: 'NDA' | 'MSA' | null
          file_path?: string | null
          contract_text: string
          page_count: number
          token_count?: number | null
          status?: 'processing' | 'completed' | 'error'
          error_message?: string | null
          processing_started_at?: string | null
          processing_completed_at?: string | null
          last_accessed_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>
        Relationships: []
      }
      key_terms: {
        Row: {
          id: string
          contract_id: string
          term_name: string
          value: string | null
          page_number: number | null
          confidence_score: number | null
          source_sentence: string | null
          is_edited: boolean
          original_ai_value: string | null
          edited_at: string | null
          display_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          term_name: string
          value?: string | null
          page_number?: number | null
          confidence_score?: number | null
          source_sentence?: string | null
          is_edited?: boolean
          original_ai_value?: string | null
          edited_at?: string | null
          display_order?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['key_terms']['Insert']>
        Relationships: []
      }
      custom_key_terms: {
        Row: {
          id: string
          contract_id: string
          term_name: string
          value: string | null
          page_number: number | null
          confidence_score: number | null
          source_sentence: string | null
          is_edited: boolean
          original_ai_value: string | null
          edited_at: string | null
          display_order: number | null
          is_manual: boolean
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          term_name: string
          value?: string | null
          page_number?: number | null
          confidence_score?: number | null
          source_sentence?: string | null
          is_edited?: boolean
          original_ai_value?: string | null
          edited_at?: string | null
          display_order?: number | null
          is_manual?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['custom_key_terms']['Insert']>
        Relationships: []
      }
      chat_sessions: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_sessions']['Insert']>
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          cited_pages: number[]
          query_classification: 'contract' | 'history' | 'both' | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          cited_pages?: number[]
          query_classification?: 'contract' | 'history' | 'both' | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>
        Relationships: []
      }
      user_feedback: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          rating: 'up' | 'down'
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          rating: 'up' | 'down'
          comment?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_feedback']['Insert']>
        Relationships: []
      }
      term_corrections: {
        Row: {
          id: string
          contract_id: string
          user_id: string
          term_table: 'key_terms' | 'custom_key_terms'
          term_id: string
          term_name: string
          original_ai_value: string | null
          corrected_value: string | null
          corrected_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          user_id: string
          term_table: 'key_terms' | 'custom_key_terms'
          term_id: string
          term_name: string
          original_ai_value?: string | null
          corrected_value?: string | null
          corrected_at?: string
        }
        Update: Partial<Database['public']['Tables']['term_corrections']['Insert']>
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          id: string
          identifier: string
          action: string
          created_at: string
        }
        Insert: {
          id?: string
          identifier: string
          action: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['rate_limit_events']['Insert']>
        Relationships: []
      }
    }
    Views: {
      v_correction_rate_7d: {
        Row: {
          corrections_last_7d: number
          terms_created_last_7d: number
          correction_rate: number
        }
        Relationships: []
      }
    }
    Functions: {
      touch_contract_access: {
        Args: { p_contract_id: string }
        Returns: void
      }
    }
  }
}
