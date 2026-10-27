export interface DeliveryOrder {
  order_id: number; customer_id: number; delivery_date: string; quantity: number;
  unit_price: number; unit_cost: number; status: string;
  name: string; phone: string; address: string; latitude: number; longitude: number;
}
export interface Settings {
  delivery_date: string; departure_time: string; deadline_time: string;
  origin: { latitude: number | null; longitude: number | null };
  speed_kmh: number; service_minutes: number; fixed_cost: number;
  cost_per_km_per_box: number; return_to_shop: boolean;
}
export interface PlannedStop {
  order: DeliveryOrder; stop_sequence: number; distance_from_previous_km: number;
  estimated_arrival_at: string; estimated_departure_at: string;
}
export interface PlannedJob {
  stops: PlannedStop[]; total_boxes: number; total_distance_km: number;
  total_duration_minutes: number; delivery_cost: number; revenue: number; food_cost: number; profit: number;
}
export interface Preview {
  preview_id: string; expires_at: string; method: string;
  settings: Settings; jobs: PlannedJob[];
  summary: { total_orders: number; total_boxes: number; riders: number; total_distance_km: number;
    delivery_cost: number; revenue: number; food_cost: number; profit: number };
}
export interface JobListItem {
  job_id: number; job_code: string; delivery_date: string; departure_at: string; deadline_at: string;
  status: string; started_at: string | null; completed_at: string | null;
  total_orders: number; delivered_orders: number; total_boxes: number | null;
  total_distance_km: number; total_duration_minutes: number; delivery_cost: number; profit: number | null;
}
export interface RiderJob extends JobListItem {
  settings: Settings | null;
  totals: Omit<PlannedJob, 'stops'> | null;
  stops: { stop_id: number; order_id: number; stop_sequence: number; estimated_arrival_at: string;
    delivered_at: string | null; late: boolean; name: string; phone: string; address: string;
    latitude: number; longitude: number; quantity: number; order: DeliveryOrder | null }[];
}
export interface RouteLine { type: 'LineString'; coordinates: [number, number][] }
