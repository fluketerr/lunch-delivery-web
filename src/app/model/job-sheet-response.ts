export interface JobStopResponse {
  stop_id: number;
  order_id: number;
  stop_sequence: number;
  name: string;
  phone: string;
  quantity: number;
  delivery_address: string;
  delivery_latitude: string | number;
  delivery_longitude: string | number;
  estimated_arrival_at: string | null;
  delivered_at: string | null;
}

export interface JobSheetResponse {
  job_id: number;
  job_code: string;
  delivery_date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  stops: JobStopResponse[];
  totals: {
    total_boxes: number;
  };
}