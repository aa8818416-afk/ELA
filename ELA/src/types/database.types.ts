export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          daily_usage: number
          id: string
          last_reset: string
          model_name: string | null
          project_name: string
          status: string
        }
        Insert: {
          api_key: string
          daily_usage?: number
          id?: string
          last_reset?: string
          model_name?: string | null
          project_name: string
          status?: string
        }
        Update: {
          api_key?: string
          daily_usage?: number
          id?: string
          last_reset?: string
          model_name?: string | null
          project_name?: string
          status?: string
        }
        Relationships: []
      }
      api_key_models: {
        Row: {
          id: string
          key_id: string
          model_name: string
          daily_usage: number
          daily_limit: number
          status: string
          created_at: string
          thinking_level: string | null
        }
        Insert: {
          id?: string
          key_id: string
          model_name: string
          daily_usage?: number
          daily_limit?: number
          status?: string
          created_at?: string
          thinking_level?: string | null
        }
        Update: {
          id?: string
          key_id?: string
          model_name?: string
          daily_usage?: number
          daily_limit?: number
          status?: string
          created_at?: string
          thinking_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_key_models_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          }
        ]
      }
      diseases: {
        Row: {
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      distributors: {
        Row: {
          active_status: boolean
          pending_commission: number
          profile_id: string
          village: string | null
          wallet_balance: number
          governorate: string | null
          center: string | null
          main_road: string | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          supervised_villages: string[] | null
          total_acres: number | null
          status: Database["public"]["Enums"]["distributor_status"]
        }
        Insert: {
          active_status?: boolean
          pending_commission?: number
          profile_id: string
          village?: string | null
          wallet_balance?: number
          governorate?: string | null
          center?: string | null
          main_road?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          supervised_villages?: string[] | null
          total_acres?: number | null
          status?: Database["public"]["Enums"]["distributor_status"]
        }
        Update: {
          active_status?: boolean
          pending_commission?: number
          profile_id?: string
          village?: string | null
          wallet_balance?: number
          governorate?: string | null
          center?: string | null
          main_road?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          supervised_villages?: string[] | null
          total_acres?: number | null
          status?: Database["public"]["Enums"]["distributor_status"]
        }
        Relationships: [
          {
            foreignKeyName: "distributors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      farmers: {
        Row: {
          distributor_id: string
          farm_profile: Json | null
          profile_id: string
          pin_hash: string | null
          governorate: string | null
          center: string | null
          village: string | null
        }
        Insert: {
          distributor_id: string
          farm_profile?: Json | null
          profile_id: string
          pin_hash?: string | null
          governorate?: string | null
          center?: string | null
          village?: string | null
        }
        Update: {
          distributor_id?: string
          farm_profile?: Json | null
          profile_id?: string
          pin_hash?: string | null
          governorate?: string | null
          center?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmers_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "farmers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_buy_offers: {
        Row: {
          active_status: boolean
          created_at: string
          end_date: string | null
          id: string
          product_id: string
          tier1_discount: number
          tier1_qty: number
          tier2_discount: number | null
          tier2_qty: number | null
          tier3_discount: number | null
          tier3_qty: number | null
        }
        Insert: {
          active_status?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          product_id: string
          tier1_discount: number
          tier1_qty: number
          tier2_discount?: number | null
          tier2_qty?: number | null
          tier3_discount?: number | null
          tier3_qty?: number | null
        }
        Update: {
          active_status?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          product_id?: string
          tier1_discount?: number
          tier1_qty?: number
          tier2_discount?: number | null
          tier2_qty?: number | null
          tier3_discount?: number | null
          tier3_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_buy_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          collected_from_farmer: boolean
          created_at: string
          created_by_type: string
          delivered_at: string | null
          distributor_id: string
          farmer_id: string
          id: string
          is_seen: boolean
          payment_status: Database["public"]["Enums"]["payment_status"]
          settled_at: string | null
          settled_to_admin: boolean
          status: Database["public"]["Enums"]["order_status"]
          total_price: number
        }
        Insert: {
          collected_from_farmer?: boolean
          created_at?: string
          created_by_type?: string
          delivered_at?: string | null
          distributor_id: string
          farmer_id: string
          id?: string
          is_seen?: boolean
          payment_status?: Database["public"]["Enums"]["payment_status"]
          settled_at?: string | null
          settled_to_admin?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number
        }
        Update: {
          collected_from_farmer?: boolean
          created_at?: string
          created_by_type?: string
          delivered_at?: string | null
          distributor_id?: string
          farmer_id?: string
          id?: string
          is_seen?: boolean
          payment_status?: Database["public"]["Enums"]["payment_status"]
          settled_at?: string | null
          settled_to_admin?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      products: {
        Row: {
          active_ingredient: string | null
          agent_commission: number
          id: string
          image_url: string | null
          name_ar: string
          price_to_farmer: number
          product_type: string[] | null
          stock_status: boolean
          target_crops: string[] | null
          wholesale_cost: number
          package_size: number | null
          package_unit: string | null
          dose_unit: 'per_feddan' | 'per_100L' | null
          dose_amount: number | null
        }
        Insert: {
          active_ingredient?: string | null
          agent_commission?: number
          id?: string
          image_url?: string | null
          name_ar: string
          price_to_farmer?: number
          product_type?: string[] | null
          stock_status?: boolean
          target_crops?: string[] | null
          wholesale_cost?: number
          package_size?: number | null
          package_unit?: string | null
          dose_unit?: 'per_feddan' | 'per_100L' | null
          dose_amount?: number | null
        }
        Update: {
          active_ingredient?: string | null
          agent_commission?: number
          id?: string
          image_url?: string | null
          name_ar?: string
          price_to_farmer?: number
          product_type?: string[] | null
          stock_status?: boolean
          target_crops?: string[] | null
          wholesale_cost?: number
          package_size?: number | null
          package_unit?: string | null
          dose_unit?: 'per_feddan' | 'per_100L' | null
          dose_amount?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      treatments: {
        Row: {
          disease_id: string
          product_id: string
        }
        Insert: {
          disease_id: string
          product_id: string
        }
        Update: {
          disease_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_disease_id_fkey"
            columns: ["disease_id"]
            isOneToOne: false
            referencedRelation: "diseases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          driver_name: string
          driver_phone: string | null
          id: string
          order_ids: string[] | null
          status: string
        }
        Insert: {
          created_at?: string
          driver_name: string
          driver_phone?: string | null
          id?: string
          order_ids?: string[] | null
          status?: string
        }
        Update: {
          created_at?: string
          driver_name?: string
          driver_phone?: string | null
          id?: string
          order_ids?: string[] | null
          status?: string
        }
        Relationships: []
      }
      tts_settings: {
        Row: {
          id: string
          voice: string
          rate: string
          pitch: string
          volume: string
          break_on_comma_ms: number
          break_on_period_ms: number
          chunk_max_chars: number
          auto_breaks_enabled: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          voice?: string
          rate?: string
          pitch?: string
          volume?: string
          break_on_comma_ms?: number
          break_on_period_ms?: number
          chunk_max_chars?: number
          auto_breaks_enabled?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          voice?: string
          rate?: string
          pitch?: string
          volume?: string
          break_on_comma_ms?: number
          break_on_period_ms?: number
          chunk_max_chars?: number
          auto_breaks_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      },
      farmer_fields: {
        Row: {
          id: string
          farmer_id: string
          field_name: string | null
          crop_type: string
          planting_date: string
          latitude: number | null
          longitude: number | null
          area_feddan: number | null
          is_active: boolean
          notifications_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          farmer_id: string
          field_name?: string | null
          crop_type: string
          planting_date: string
          latitude?: number | null
          longitude?: number | null
          area_feddan?: number | null
          is_active?: boolean
          notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          farmer_id?: string
          field_name?: string | null
          crop_type?: string
          planting_date?: string
          latitude?: number | null
          longitude?: number | null
          area_feddan?: number | null
          is_active?: boolean
          notifications_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_fields_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["profile_id"]
          }
        ]
      }
      crop_risk_rules: {
        Row: {
          id: string
          version: number
          crop_type: string
          stage_from_day: number
          stage_to_day: number
          risk_type: string
          risk_causes: Json
          condition_duration_days: number
          severity: Database["public"]["Enums"]["crop_risk_severity"]
          advice_text: string
          advice_reason: string | null
          follow_up_days: number
          product_link: string | null
          source_reference: string | null
          is_active: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          version?: number
          crop_type: string
          stage_from_day: number
          stage_to_day: number
          risk_type: string
          risk_causes?: Json
          condition_duration_days?: number
          severity: Database["public"]["Enums"]["crop_risk_severity"]
          advice_text: string
          advice_reason?: string | null
          follow_up_days?: number
          product_link?: string | null
          source_reference?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          version?: number
          crop_type?: string
          stage_from_day?: number
          stage_to_day?: number
          risk_type?: string
          risk_causes?: Json
          condition_duration_days?: number
          severity?: Database["public"]["Enums"]["crop_risk_severity"]
          advice_text?: string
          advice_reason?: string | null
          follow_up_days?: number
          product_link?: string | null
          source_reference?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_risk_rules_product_link_fkey"
            columns: ["product_link"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      crop_quality_tips: {
        Row: {
          id: string
          crop_type: string
          stage_from_day: number
          stage_to_day: number
          tip_text: string
          tip_reason: string | null
          rotation_order: number
        }
        Insert: {
          id?: string
          crop_type: string
          stage_from_day: number
          stage_to_day: number
          tip_text: string
          tip_reason?: string | null
          rotation_order?: number
        }
        Update: {
          id?: string
          crop_type?: string
          stage_from_day?: number
          stage_to_day?: number
          tip_text?: string
          tip_reason?: string | null
          rotation_order?: number
        }
        Relationships: []
      }
      alert_instances: {
        Row: {
          id: string
          farmer_field_id: string
          risk_type: string
          matched_risk_rule_id: string
          rule_version_snapshot: number
          severity_snapshot: Database["public"]["Enums"]["crop_risk_severity"]
          follow_up_days_snapshot: number
          advice_text_snapshot: string
          advice_reason_snapshot: string | null
          product_link_snapshot: string | null
          status: Database["public"]["Enums"]["alert_instance_status"]
          origin_state: Database["public"]["Enums"]["alert_origin_state"] | null
          no_response_count: number
          false_alarm_streak_count: number
          parent_alert_id: string | null
          confidence_level: Database["public"]["Enums"]["alert_confidence_level"]
          order_status: Database["public"]["Enums"]["alert_order_status"] | null
          order_placed_at: string | null
          order_delivered_at: string | null
          diagnosis_started_at: string | null
          diagnosis_paused_at: string | null
          follow_up_due_at: string | null
          escalated_at: string | null
          escalation_deadline_at: string | null
          weather_snapshot_at_trigger: Json
          weather_snapshot_at_response: Json | null
          created_at: string
          updated_at: string
          closed_at: string | null
          closed_reason: Database["public"]["Enums"]["alert_closed_reason"] | null
        }
        Insert: {
          id?: string
          farmer_field_id: string
          risk_type: string
          matched_risk_rule_id: string
          rule_version_snapshot: number
          severity_snapshot: Database["public"]["Enums"]["crop_risk_severity"]
          follow_up_days_snapshot: number
          advice_text_snapshot: string
          advice_reason_snapshot?: string | null
          product_link_snapshot?: string | null
          status?: Database["public"]["Enums"]["alert_instance_status"]
          origin_state?: Database["public"]["Enums"]["alert_origin_state"] | null
          no_response_count?: number
          false_alarm_streak_count?: number
          parent_alert_id?: string | null
          confidence_level?: Database["public"]["Enums"]["alert_confidence_level"]
          order_status?: Database["public"]["Enums"]["alert_order_status"] | null
          order_placed_at?: string | null
          order_delivered_at?: string | null
          diagnosis_started_at?: string | null
          diagnosis_paused_at?: string | null
          follow_up_due_at?: string | null
          escalated_at?: string | null
          escalation_deadline_at?: string | null
          weather_snapshot_at_trigger?: Json
          weather_snapshot_at_response?: Json | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          closed_reason?: Database["public"]["Enums"]["alert_closed_reason"] | null
        }
        Update: {
          id?: string
          farmer_field_id?: string
          risk_type?: string
          matched_risk_rule_id?: string
          rule_version_snapshot?: number
          severity_snapshot?: Database["public"]["Enums"]["crop_risk_severity"]
          follow_up_days_snapshot?: number
          advice_text_snapshot?: string
          advice_reason_snapshot?: string | null
          product_link_snapshot?: string | null
          status?: Database["public"]["Enums"]["alert_instance_status"]
          origin_state?: Database["public"]["Enums"]["alert_origin_state"] | null
          no_response_count?: number
          false_alarm_streak_count?: number
          parent_alert_id?: string | null
          confidence_level?: Database["public"]["Enums"]["alert_confidence_level"]
          order_status?: Database["public"]["Enums"]["alert_order_status"] | null
          order_placed_at?: string | null
          order_delivered_at?: string | null
          diagnosis_started_at?: string | null
          diagnosis_paused_at?: string | null
          follow_up_due_at?: string | null
          escalated_at?: string | null
          escalation_deadline_at?: string | null
          weather_snapshot_at_trigger?: Json
          weather_snapshot_at_response?: Json | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          closed_reason?: Database["public"]["Enums"]["alert_closed_reason"] | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_instances_farmer_field_id_fkey"
            columns: ["farmer_field_id"]
            isOneToOne: false
            referencedRelation: "farmer_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_matched_risk_rule_id_fkey"
            columns: ["matched_risk_rule_id"]
            isOneToOne: false
            referencedRelation: "crop_risk_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_instances_parent_alert_id_fkey"
            columns: ["parent_alert_id"]
            isOneToOne: false
            referencedRelation: "alert_instances"
            referencedColumns: ["id"]
          }
        ]
      }
      daily_agenda_log: {
        Row: {
          id: string
          farmer_field_id: string
          date: string
          alert_instance_id: string | null
          quality_tip_id: string | null
          farmer_feedback_raw: string | null
          weather_snapshot: Json
          created_at: string
        }
        Insert: {
          id?: string
          farmer_field_id: string
          date: string
          alert_instance_id?: string | null
          quality_tip_id?: string | null
          farmer_feedback_raw?: string | null
          weather_snapshot?: Json
          created_at?: string
        }
        Update: {
          id?: string
          farmer_field_id?: string
          date?: string
          alert_instance_id?: string | null
          quality_tip_id?: string | null
          farmer_feedback_raw?: string | null
          weather_snapshot?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_agenda_log_farmer_field_id_fkey"
            columns: ["farmer_field_id"]
            isOneToOne: false
            referencedRelation: "farmer_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_agenda_log_alert_instance_id_fkey"
            columns: ["alert_instance_id"]
            isOneToOne: false
            referencedRelation: "alert_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_agenda_log_quality_tip_id_fkey"
            columns: ["quality_tip_id"]
            isOneToOne: false
            referencedRelation: "crop_quality_tips"
            referencedColumns: ["id"]
          }
        ]
      }
      rule_review_flags: {
        Row: {
          id: string
          farmer_field_id: string
          risk_type: string
          matched_risk_rule_id: string
          streak_count: number
          reviewed: boolean
          admin_notes: string | null
          created_at: string
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          farmer_field_id: string
          risk_type: string
          matched_risk_rule_id: string
          streak_count?: number
          reviewed?: boolean
          admin_notes?: string | null
          created_at?: string
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          farmer_field_id?: string
          risk_type?: string
          matched_risk_rule_id?: string
          streak_count?: number
          reviewed?: boolean
          admin_notes?: string | null
          created_at?: string
          reviewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_review_flags_farmer_field_id_fkey"
            columns: ["farmer_field_id"]
            isOneToOne: false
            referencedRelation: "farmer_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_review_flags_matched_risk_rule_id_fkey"
            columns: ["matched_risk_rule_id"]
            isOneToOne: false
            referencedRelation: "crop_risk_rules"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_distributor_status: {
        Args: never
        Returns: Database["public"]["Enums"]["distributor_status"]
      }
      merge_farm_profile: {
        Args: {
          farmer_id: string
          target_scope: string
          new_data: Json
        }
        Returns: void
      }
    }
    Enums: {
      order_status: "pending" | "in_transit" | "delivered" | "cancelled"
      payment_status: "unpaid" | "paid"
      user_role: "admin" | "distributor" | "farmer"
      distributor_status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED"
      crop_risk_severity: "critical" | "moderate" | "preventive"
      alert_instance_status:
        | "NO_ALERT"
        | "SENT"
        | "CLOSED_FALSE_ALARM"
        | "AWAITING_DIAGNOSIS"
        | "DIAGNOSIS_PAUSED"
        | "CONFIRMED_ACTIVE"
        | "MISDIAGNOSED_ORIGINAL"
        | "INCONCLUSIVE"
        | "PRODUCT_ORDERED"
        | "NO_RESPONSE"
        | "AUTO_CLOSED_NO_RESPONSE"
        | "FOLLOW_UP_SENT"
        | "RESOLVED"
        | "CROP_LOSS"
        | "CLOSED_SEASON_END"
        | "AMBIGUOUS_RETRY"
        | "AWAITING_DISTRIBUTOR_ACTION"
      alert_origin_state: "SENT" | "FOLLOW_UP_SENT" | "INCONCLUSIVE" | "AWAITING_DIAGNOSIS"
      alert_confidence_level: "weather_based" | "farmer_confirmed" | "purchase_confirmed" | "unconfirmed"
      alert_order_status: "ordered" | "delivered" | "cancelled" | "expired"
      alert_closed_reason:
        | "false_alarm"
        | "resolved"
        | "auto_closed_no_response"
        | "season_end"
        | "crop_loss"
        | "superseded_by_higher_severity"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: ["pending", "in_transit", "delivered", "cancelled"],
      payment_status: ["unpaid", "paid"],
      user_role: ["admin", "distributor", "farmer"],
      distributor_status: ["PENDING_APPROVAL", "APPROVED", "REJECTED"],
    },
  },
} as const
