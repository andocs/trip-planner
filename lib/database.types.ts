// Generated to match supabase/migrations. Regenerate with `npm run db:types` once linked.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      trips: {
        Row: {
          archived_at: string | null
          budget: number
          created_at: string
          destination: string | null
          end_date: string | null
          foreign_currency: string
          home_currency: string
          id: string
          invite_rotated_at: string
          join_token: string
          map_region: string
          name: string
          onboarding_step: number
          owner_id: string | null
          rate: number
          rate_date: string | null
          start_date: string | null
          status: string
          timezone: string
        }
        Insert: {
          archived_at?: string | null
          budget?: number
          created_at?: string
          destination?: string | null
          end_date?: string | null
          foreign_currency?: string
          home_currency?: string
          id?: string
          invite_rotated_at?: string
          join_token?: string
          map_region?: string
          name?: string
          onboarding_step?: number
          owner_id?: string | null
          rate?: number
          rate_date?: string | null
          start_date?: string | null
          status?: string
          timezone?: string
        }
        Update: {
          archived_at?: string | null
          budget?: number
          created_at?: string
          destination?: string | null
          end_date?: string | null
          foreign_currency?: string
          home_currency?: string
          id?: string
          invite_rotated_at?: string
          join_token?: string
          map_region?: string
          name?: string
          onboarding_step?: number
          owner_id?: string | null
          rate?: number
          rate_date?: string | null
          start_date?: string | null
          status?: string
          timezone?: string
        }
        Relationships: [

        ]
      }
      trip_members: {
        Row: {
          email: string | null
          joined_at: string
          label: string | null
          revoked_at: string | null
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          email?: string | null
          joined_at?: string
          label?: string | null
          revoked_at?: string | null
          role?: string
          trip_id: string
          user_id: string
        }
        Update: {
          email?: string | null
          joined_at?: string
          label?: string | null
          revoked_at?: string | null
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      travelers: {
        Row: {
          created_at: string
          id: string
          name: string
          sort: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort?: number
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travelers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          city: string
          country: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          nights: number
          sort: number
          trip_id: string
        }
        Insert: {
          city: string
          country?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          nights?: number
          sort?: number
          trip_id: string
        }
        Update: {
          city?: string
          country?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          nights?: number
          sort?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          planned: number | null
          sort: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          planned?: number | null
          sort?: number
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          planned?: number | null
          sort?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          note: string | null
          paid_by: string | null
          source_id: string | null
          source_table: string | null
          spent_on: string
          trip_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          description: string
          id?: string
          note?: string | null
          paid_by?: string | null
          source_id?: string | null
          source_table?: string | null
          spent_on: string
          trip_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          note?: string | null
          paid_by?: string | null
          source_id?: string | null
          source_table?: string | null
          spent_on?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_trip_id_fkey"
            columns: ["category_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "expenses_paid_by_trip_id_fkey"
            columns: ["paid_by", "trip_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id", "trip_id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          activity: string
          at_time: string | null
          city: string | null
          created_at: string
          details: Json
          kind: string
          position: number | null
          day: number | null
          done: boolean
          duration_min: number | null
          id: string
          note: string | null
          on_date: string | null
          source_id: string | null
          source_table: string | null
          tentative: boolean
          trip_id: string
          type: string | null
        }
        Insert: {
          activity: string
          at_time?: string | null
          city?: string | null
          created_at?: string
          details?: Json
          kind?: string
          position?: number | null
          day?: number | null
          done?: boolean
          duration_min?: number | null
          id?: string
          note?: string | null
          on_date?: string | null
          source_id?: string | null
          source_table?: string | null
          tentative?: boolean
          trip_id: string
          type?: string | null
        }
        Update: {
          activity?: string
          at_time?: string | null
          city?: string | null
          created_at?: string
          details?: Json
          kind?: string
          position?: number | null
          day?: number | null
          done?: boolean
          duration_min?: number | null
          id?: string
          note?: string | null
          on_date?: string | null
          source_id?: string | null
          source_table?: string | null
          tentative?: boolean
          trip_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      flights: {
        Row: {
          airline: string | null
          arrives_at: string | null
          arr_tz: string | null
          booking_ref: string | null
          created_at: string
          departs_at: string | null
          dep_tz: string | null
          duration_min: number | null
          fare: number | null
          flight_no: string | null
          from_code: string | null
          gate: string | null
          has_ref: boolean
          id: string
          seat: string | null
          status: string
          terminal: string | null
          to_code: string | null
          trip_id: string
        }
        Insert: {
          airline?: string | null
          arrives_at?: string | null
          arr_tz?: string | null
          booking_ref?: string | null
          created_at?: string
          departs_at?: string | null
          dep_tz?: string | null
          duration_min?: number | null
          fare?: number | null
          flight_no?: string | null
          from_code?: string | null
          gate?: string | null
          has_ref?: boolean
          id?: string
          seat?: string | null
          status?: string
          terminal?: string | null
          to_code?: string | null
          trip_id: string
        }
        Update: {
          airline?: string | null
          arrives_at?: string | null
          arr_tz?: string | null
          booking_ref?: string | null
          created_at?: string
          departs_at?: string | null
          dep_tz?: string | null
          duration_min?: number | null
          fare?: number | null
          flight_no?: string | null
          from_code?: string | null
          gate?: string | null
          has_ref?: boolean
          id?: string
          seat?: string | null
          status?: string
          terminal?: string | null
          to_code?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flights_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          cost_text: string | null
          created_at: string
          id: string
          link: string | null
          provider: string | null
          route: string
          trip_id: string
        }
        Insert: {
          cost_text?: string | null
          created_at?: string
          id?: string
          link?: string | null
          provider?: string | null
          route: string
          trip_id: string
        }
        Update: {
          cost_text?: string | null
          created_at?: string
          id?: string
          link?: string | null
          provider?: string | null
          route?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      stays: {
        Row: {
          check_in: string | null
          check_out: string | null
          city: string | null
          confirmation: string | null
          created_at: string
          details: Json
          hotel: string
          id: string
          note: string | null
          room: string | null
          status: string
          total: number | null
          trip_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          confirmation?: string | null
          created_at?: string
          details?: Json
          hotel: string
          id?: string
          note?: string | null
          room?: string | null
          status?: string
          total?: number | null
          trip_id: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          confirmation?: string | null
          created_at?: string
          details?: Json
          hotel?: string
          id?: string
          note?: string | null
          room?: string | null
          status?: string
          total?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_ideas: {
        Row: {
          city: string | null
          created_at: string
          deal_breaker: boolean
          details: Json
          decision: string
          hotel: string
          id: string
          nights: number | null
          room: string | null
          total: number | null
          trip_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          decision?: string
          hotel: string
          id?: string
          nights?: number | null
          room?: string | null
          total?: number | null
          trip_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          decision?: string
          hotel?: string
          id?: string
          nights?: number | null
          room?: string | null
          total?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_ideas_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      food_places: {
        Row: {
          city: string | null
          created_at: string
          deal_breaker: boolean
          details: Json
          day: number | null
          decision: string
          id: string
          name: string
          note: string | null
          price: number | null
          status: string
          trip_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          day?: number | null
          decision?: string
          id?: string
          name: string
          note?: string | null
          price?: number | null
          status?: string
          trip_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          day?: number | null
          decision?: string
          id?: string
          name?: string
          note?: string | null
          price?: number | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          dish: string
          id: string
          price_foreign: number | null
          restaurant: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          dish: string
          id?: string
          price_foreign?: number | null
          restaurant: string
          trip_id: string
        }
        Update: {
          created_at?: string
          dish?: string
          id?: string
          price_foreign?: number | null
          restaurant?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      attractions: {
        Row: {
          city: string | null
          created_at: string
          deal_breaker: boolean
          details: Json
          day: number | null
          decision: string
          id: string
          name: string
          note: string | null
          price: number | null
          status: string
          trip_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          day?: number | null
          decision?: string
          id?: string
          name: string
          note?: string | null
          price?: number | null
          status?: string
          trip_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          deal_breaker?: boolean
          details?: Json
          day?: number | null
          decision?: string
          id?: string
          name?: string
          note?: string | null
          price?: number | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attractions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item: string
          packed: boolean
          trip_id: string
          whose: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item: string
          packed?: boolean
          trip_id: string
          whose?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item?: string
          packed?: boolean
          trip_id?: string
          whose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          bought: boolean
          budget: number | null
          created_at: string
          for_whom: string
          gift: string
          id: string
          trip_id: string
        }
        Insert: {
          bought?: boolean
          budget?: number | null
          created_at?: string
          for_whom: string
          gift: string
          id?: string
          trip_id: string
        }
        Update: {
          bought?: boolean
          budget?: number | null
          created_at?: string
          for_whom?: string
          gift?: string
          id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gifts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      place_refs: {
        Row: {
          coords_at: string | null
          created_at: string
          id: string
          item_id: string
          item_table: string
          lat: number | null
          lng: number | null
          place_id: string
          trip_id: string
        }
        Insert: {
          coords_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_table: string
          lat?: number | null
          lng?: number | null
          place_id: string
          trip_id: string
        }
        Update: {
          coords_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_table?: string
          lat?: number | null
          lng?: number | null
          place_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_refs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_refs: {
        Row: { booking_ref: string; created_at: string; flight_id: string; id: string; trip_id: string }
        Insert: { booking_ref: string; created_at?: string; flight_id: string; id?: string; trip_id: string }
        Update: { booking_ref?: string; created_at?: string; flight_id?: string; id?: string; trip_id?: string }
        Relationships: []
      }
      item_images: {
        Row: {
          created_at: string
          credit: string | null
          id: string
          item_id: string
          item_table: string
          license: string | null
          license_url: string | null
          page_url: string | null
          position: number
          source: string
          storage_path: string | null
          trip_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          credit?: string | null
          id?: string
          item_id: string
          item_table: string
          license?: string | null
          license_url?: string | null
          page_url?: string | null
          position?: number
          source: string
          storage_path?: string | null
          trip_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          credit?: string | null
          id?: string
          item_id?: string
          item_table?: string
          license?: string | null
          license_url?: string | null
          page_url?: string | null
          position?: number
          source?: string
          storage_path?: string | null
          trip_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_images_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      api_caps: {
        Row: { sku: string; monthly_cap: number; free_allowance: number }
        Insert: { sku: string; monthly_cap: number; free_allowance: number }
        Update: { sku?: string; monthly_cap?: number; free_allowance?: number }
        Relationships: []
      }
      api_usage: {
        Row: { period: string; sku: string; calls: number }
        Insert: { period: string; sku: string; calls?: number }
        Update: { period?: string; sku?: string; calls?: number }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_table: string
          trip_id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_table: string
          trip_id: string
          updated_at?: string
          user_id?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_table?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          item_id: string
          item_table: string
          trip_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          item_id: string
          item_table: string
          trip_id: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          item_id?: string
          item_table?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          created_at: string
          id: string
          text: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          text: string
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          text?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit: { Args: { t: string }; Returns: boolean }
      finish_onboarding: { Args: { p_trip: string; p_starter?: boolean }; Returns: undefined }
      save_onboarding: { Args: { p_trip: string; p_step: number; p_patch: Json }; Returns: undefined }
      can_view: { Args: { t: string }; Returns: boolean }
      claim_trip: { Args: { p_trip: string }; Returns: undefined }
      claimable_trips: { Args: never; Returns: Database["public"]["Tables"]["trips"]["Row"][] }
      is_admin: { Args: never; Returns: boolean }
      regenerate_invite: { Args: { p_trip: string }; Returns: string }
      revoke_viewer: { Args: { p_trip: string; p_user: string }; Returns: undefined }
      trip_role: { Args: { t: string }; Returns: string }
      trip_bootstrap: { Args: never; Returns: Json }
      trip_people: { Args: { p_trip: string }; Returns: { user_id: string; label: string | null; role: string }[] }
      set_my_label: { Args: { p_trip: string; p_label: string }; Returns: undefined }
      reserve_api_call: { Args: { p_sku: string }; Returns: string }
      purge_stale_place_coords: { Args: never; Returns: number }
      photo_storage_status: { Args: never; Returns: { used: number; cap: number }[] }
      photo_storage_cap: { Args: never; Returns: number }
      active_trip: {
        Args: never
        Returns: Database["public"]["Tables"]["trips"]["Row"][]
      }
      create_trip: {
        Args: { p_name?: string }
        Returns: string
      }
      is_trip_member: {
        Args: { t: string }
        Returns: boolean
      }
      join_trip: {
        Args: { p_token: string }
        Returns: string
      }
      regenerate_join_token: {
        Args: { p_trip: string }
        Returns: string
      }
      start_new_trip: {
        Args: { p_copy_setup?: boolean }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
