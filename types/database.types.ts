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
      expense_type: 'EGG_PURCHASE' | 'FEED' | 'ELECTRICITY' | 'FUEL' | 'MEDICINE' | 'VACCINE' | 'LABOR' | 'MAINTENANCE' | 'TRANSPORT' | 'OTHER'
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
          incubator_id: string | null
          quantity_received: number
          status: 'LOGGED' | 'SETTER' | 'HATCHER' | 'BROODER' | 'COMPLETED' | 'FAILED' | 'DISCARDED' | 'CANCELLED'
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
          incubator_id?: string | null
          quantity_received: number
          status?: 'LOGGED' | 'SETTER' | 'HATCHER' | 'BROODER' | 'COMPLETED' | 'FAILED' | 'DISCARDED' | 'CANCELLED'
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
      expense_categories: {
        Row: {
          id: string
          tenant_id: string | null
          name: string
          expense_type: Database['public']['Enums']['expense_type']
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          name: string
          expense_type: Database['public']['Enums']['expense_type']
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['expense_categories']['Insert']>
      }
      cost_entries: {
        Row: {
          id: string
          tenant_id: string | null
          category_id: string
          batch_id: string | null
          order_id: string | null
          amount: number
          description: string | null
          incurred_at: string
          recorded_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          category_id: string
          batch_id?: string | null
          order_id?: string | null
          amount: number
          description?: string | null
          incurred_at?: string
          recorded_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['cost_entries']['Insert']>
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
      alert_events: {
        Row: {
          id: string
          tenant_id: string | null
          alert_rule_id: string | null
          device_id: string | null
          incubator_id: string | null
          batch_id: string | null
          metric_id: string | null
          observed_value: number | null
          title: string
          description: string | null
          severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
          status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED'
          triggered_at: string
          acknowledged_at: string | null
          acknowledged_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
          sync_version: number
          client_updated_at: string | null
          last_synced_at: string | null
          origin_device_id: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          alert_rule_id?: string | null
          device_id?: string | null
          incubator_id?: string | null
          batch_id?: string | null
          metric_id?: string | null
          observed_value?: number | null
          title: string
          description?: string | null
          severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
          status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED'
          triggered_at?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
          sync_version?: number
          client_updated_at?: string | null
          last_synced_at?: string | null
          origin_device_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['alert_events']['Insert']>
      }
    }
  }
}
