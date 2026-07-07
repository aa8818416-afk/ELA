export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          model_name: string
          project_name: string
          status: string
        }
        Insert: {
          api_key: string
          daily_usage?: number
          id?: string
          last_reset?: string
          model_name?: string
          project_name: string
          status?: string
        }
        Update: {
          api_key?: string
          daily_usage?: number
          id?: string
          last_reset?: string
          model_name?: string
          project_name?: string
          status?: string
        }
        Relationships: []
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
        }
        Insert: {
          active_status?: boolean
          pending_commission?: number
          profile_id: string
          village?: string | null
          wallet_balance?: number
        }
        Update: {
          active_status?: boolean
          pending_commission?: number
          profile_id?: string
          village?: string | null
          wallet_balance?: number
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
          current_crop: string | null
          distributor_id: string | null
          land_size: number | null
          profile_id: string
        }
        Insert: {
          current_crop?: string | null
          distributor_id?: string | null
          land_size?: number | null
          profile_id: string
        }
        Update: {
          current_crop?: string | null
          distributor_id?: string | null
          land_size?: number | null
          profile_id?: string
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
          created_at: string
          distributor_id: string
          farmer_id: string
          id: string
          payment_status: "unpaid" | "paid"
          status: "pending" | "in_transit" | "delivered" | "cancelled"
          total_price: number
        }
        Insert: {
          created_at?: string
          distributor_id: string
          farmer_id: string
          id?: string
          payment_status?: "unpaid" | "paid"
          status?: "pending" | "in_transit" | "delivered" | "cancelled"
          total_price?: number
        }
        Update: {
          created_at?: string
          distributor_id?: string
          farmer_id?: string
          id?: string
          payment_status?: "unpaid" | "paid"
          status?: "pending" | "in_transit" | "delivered" | "cancelled"
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
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: "admin" | "distributor" | "farmer"
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: "admin" | "distributor" | "farmer"
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: "admin" | "distributor" | "farmer"
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
    }
    Views: Record<string, never>
    Functions: {
      get_my_role: {
        Args: Record<PropertyKey, never>
        Returns: "admin" | "distributor" | "farmer"
      }
    }
    Enums: {
      order_status: "pending" | "in_transit" | "delivered" | "cancelled"
      payment_status: "unpaid" | "paid"
      user_role: "admin" | "distributor" | "farmer"
    }
    CompositeTypes: Record<string, never>
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {
      order_status: ["pending", "in_transit", "delivered", "cancelled"],
      payment_status: ["unpaid", "paid"],
      user_role: ["admin", "distributor", "farmer"],
    },
  },
} as const
