export type Coordinates = { latitude: number; longitude: number };

// GeoJSON จาก /route เรียงพิกัดเป็น [longitude, latitude]
export interface RouteLine {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface PreviewJobRoute {
  // อ้างอิง jobs()[jobIndex] ของ preview นี้ ยังไม่ใช่ job_id ในฐานข้อมูล
  jobIndex: number;
  line: RouteLine;
}

export interface PlanningOrder extends Coordinates {
  order_id: number;
  customer_id: number;
  delivery_date: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  status: string;
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface PlanningSettings {
  delivery_date: string;
  departure_time: string;
  deadline_time: string;
  origin: Coordinates;
  speed_kmh: number;
  service_minutes: number;
  fixed_cost: number;
  cost_per_km_per_box: number;
  return_to_shop: boolean;
}

export interface PlannedStop {
  order: PlanningOrder;
  stop_sequence: number;
  distance_from_previous_km: number;
  estimated_arrival_at: string;
  estimated_departure_at: string;
}

export interface PlannedJob {
  stops: PlannedStop[];
  total_boxes: number;
  total_distance_km: number;
  total_duration_minutes: number;
  delivery_cost: number;
  revenue: number;
  food_cost: number;
  profit: number;
}

export interface DeliveryPlan {
  // Backend ออกให้ตอน preview: ใช้ยืนยันแผนและตรวจเวลาหมดอายุ
  preview_id: string;
  expires_at: string;
  settings: PlanningSettings;
  jobs: PlannedJob[];
  summary: {
    total_orders: number;
    total_boxes: number;
    riders: number;
    total_distance_km: number;
    delivery_cost: number;
    revenue: number;
    food_cost: number;
    profit: number;
  };
  method: string;
}

export interface StoredPlanningData {
  settings: PlanningSettings;
  job: PlannedJob;
}
