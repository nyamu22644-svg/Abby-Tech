export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Enums: {
      mortality_stage: 'INCUBATION' | 'HATCHING' | 'BROODER' | 'TRANSPORT'
      mortality_cause: 'OVERHEATING' | 'HUMIDITY_FAILURE' | 'POWER_FAILURE' | 'DISEASE' | 'WEAK_HATCH' | 'DEFORMITY' | 'CRUSHING' | 'UNKNOWN' | 'OTHER'
      incubator_type: 'AUTOMATIC' | 'MANUAL' | 'HYBRID'
      incubator_operational_status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE'
      alert_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      alert_status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
      order_action_type: 'CREATED' | 'PAYMENT_RECEIVED' | 'STATUS_UPDATED' | 'DISPATCHED' | 'CANCELLED' | 'NOTES_ADDED'
    }
    Tables: {
      customers: {
        Row: {
          id: string
          name: string
          phone: string | null
          location: string | null
          business_name: string | null
          is_repeat_customer: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          location?: string | null
          business_name?: string | null
          is_repeat_customer?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      order_audit_logs: {
        Row: {
          id: string
          order_id: string
          action: 'CREATED' | 'PAYMENT_RECEIVED' | 'STATUS_UPDATED' | 'DISPATCHED' | 'CANCELLED' | 'NOTES_ADDED'
          description: string
          performed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          action: 'CREATED' | 'PAYMENT_RECEIVED' | 'STATUS_UPDATED' | 'DISPATCHED' | 'CANCELLED' | 'NOTES_ADDED'
          description: string
          performed_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_audit_logs']['Insert']>
      }
      egg_batches: {
        Row: {
          id: string
          tenant_id: string | null
          batch_number: string
          supplier_id: string | null
          supplier_name?: string
          incubator_id: string | null
          quantity_received: number
          status: 'RECEIVED' | 'EARLY_INCUBATION' | 'CANDLING' | 'LOCKDOWN' | 'HATCHING' | 'COMPLETED' | 'STORED' | 'SOLD' | 'ARCHIVED' | 'DISCARDED'
          set_date: string | null
          expected_hatch_date: string | null
          actual_hatch_date: string | null
          quantity_hatched: number | null
          quantity_culled: number | null
          egg_purchase_cost: number | null
          transport_cost: number | null
          misc_initial_cost: number | null
          total_initial_cost: number | null
          mortality_count: number | null
          total_financial_loss: number | null
          sync_version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          batch_number: string
          supplier_id?: string | null
          supplier_name?: string
          incubator_id?: string | null
          quantity_received: number
          status?: 'RECEIVED' | 'EARLY_INCUBATION' | 'CANDLING' | 'LOCKDOWN' | 'HATCHING' | 'COMPLETED' | 'STORED' | 'SOLD' | 'ARCHIVED' | 'DISCARDED'
          set_date?: string | null
          expected_hatch_date?: string | null
          actual_hatch_date?: string | null
          quantity_hatched?: number | null
          quantity_culled?: number | null
          egg_purchase_cost?: number | null
          transport_cost?: number | null
          misc_initial_cost?: number | null
          total_initial_cost?: number | null
          mortality_count?: number | null
          total_financial_loss?: number | null
          sync_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['egg_batches']['Insert']>
      }
      mortality_events: {
        Row: {
          id: string
          batch_id: string
          stage: 'INCUBATION' | 'HATCHING' | 'BROODER' | 'TRANSPORT'
          cause: 'OVERHEATING' | 'HUMIDITY_FAILURE' | 'POWER_FAILURE' | 'DISEASE' | 'WEAK_HATCH' | 'DEFORMITY' | 'CRUSHING' | 'UNKNOWN' | 'OTHER'
          count: number
          notes: string | null
          photo_url: string | null
          estimated_financial_loss: number | null
          recorded_by: string | null
          recorded_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          stage: 'INCUBATION' | 'HATCHING' | 'BROODER' | 'TRANSPORT'
          cause: 'OVERHEATING' | 'HUMIDITY_FAILURE' | 'POWER_FAILURE' | 'DISEASE' | 'WEAK_HATCH' | 'DEFORMITY' | 'CRUSHING' | 'UNKNOWN' | 'OTHER'
          count: number
          notes?: string | null
          photo_url?: string | null
          estimated_financial_loss?: number | null
          recorded_by?: string | null
          recorded_at?: string
        }
        Update: Partial<Database['public']['Tables']['mortality_events']['Insert']>
      }
      orders: {
        Row: {
          id: string
          order_number: string
          customer_name: string
          customer_phone: string | null
          customer_id: string | null
          quantity: number
          allocated_batch_id: string | null
          payment_status: 'UNPAID' | 'DEPOSIT_PAID' | 'FULLY_PAID' | 'REFUNDED'
          dispatch_status: 'PENDING' | 'SCHEDULED' | 'DISPATCHED' | 'DELIVERED'
          pickup_date: string | null
          expected_hatch_date: string | null
          price_per_chick: number | null
          amount_paid: number | null
          total_amount: number | null
          balance_due: number | null
          status: 'INQUIRY' | 'RESERVED' | 'DEPOSIT_PAID' | 'ALLOCATED' | 'READY_FOR_DISPATCH' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number: string
          customer_name: string
          customer_phone?: string | null
          customer_id?: string | null
          quantity: number
          allocated_batch_id?: string | null
          payment_status?: 'UNPAID' | 'DEPOSIT_PAID' | 'FULLY_PAID' | 'REFUNDED'
          dispatch_status?: 'PENDING' | 'SCHEDULED' | 'DISPATCHED' | 'DELIVERED'
          pickup_date?: string | null
          expected_hatch_date?: string | null
          price_per_chick?: number | null
          amount_paid?: number | null
          total_amount?: number | null
          balance_due?: number | null
          status?: 'INQUIRY' | 'RESERVED' | 'DEPOSIT_PAID' | 'ALLOCATED' | 'READY_FOR_DISPATCH' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      operational_costs: {
        Row: {
          id: string
          batch_id: string
          category: string
          description: string
          amount: number
          created_by?: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          category: string
          description: string
          amount: number
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['operational_costs']['Insert']>
      }
      incubators: {
        Row: {
          id: string
          name: string
          model_number: string | null
          controller_type: 'AUTOMATIC' | 'MANUAL' | 'HYBRID'
          capacity: number
          operational_status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE'
          automation_capable: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          model_number?: string | null
          controller_type?: 'AUTOMATIC' | 'MANUAL' | 'HYBRID'
          capacity: number
          operational_status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE'
          automation_capable?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['incubators']['Insert']>
      }
      incubator_environmental_logs: {
        Row: {
          id: string
          incubator_id: string
          batch_id: string | null
          temperature: number | null
          humidity: number | null
          turning_status: string | null
          power_source: string | null
          alarm_state: string | null
          notes: string | null
          recorded_by: string | null
          recorded_at: string
        }
        Insert: {
          id?: string
          incubator_id: string
          batch_id?: string | null
          temperature?: number | null
          humidity?: number | null
          turning_status?: string | null
          power_source?: string | null
          alarm_state?: string | null
          notes?: string | null
          recorded_by?: string | null
          recorded_at?: string
        }
        Update: Partial<Database['public']['Tables']['incubator_environmental_logs']['Insert']>
      }
      incubation_alerts: {
        Row: {
          id: string
          incubator_id: string | null
          batch_id: string | null
          title: string
          description: string
          severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
          status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
          triggered_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          id?: string
          incubator_id?: string | null
          batch_id?: string | null
          title: string
          description: string
          severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
          status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
          triggered_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['incubation_alerts']['Insert']>
      }
    }
  }
}
