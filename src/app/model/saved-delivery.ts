import {
  PlanningOrder as DeliveryOrder,
  PlanningSettings as Settings,
  PlannedJob,
} from './delivery-response';
export interface JobListItem {
  job_id: number;
  job_code: string;
  delivery_date: string;
  departure_at: string;
  deadline_at: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_orders: number;
  delivered_orders: number;
  total_boxes: number | null;
  total_distance_km: number;
  total_duration_minutes: number;
  delivery_cost: number;
  profit: number | null;
}
export interface RiderJob extends JobListItem {
  settings: Settings | null;
  totals: Omit<PlannedJob, 'stops'> | null;
  stops: {
    stop_id: number;
    order_id: number;
    stop_sequence: number;
    estimated_arrival_at: string;
    delivered_at: string | null;
    late: boolean;
    name: string;
    phone: string;
    address: string;
    latitude: number;
    longitude: number;
    quantity: number;
    order: DeliveryOrder | null;
  }[];
}
