export interface OrderResponse {
  order_id: number;
  customer_id: number;
  delivery_date: string;
  quantity: number;
  unit_price: string;
  unit_cost: string;
  is_simulated: number;
  status: string;
  name: string;
  phone: string;
  address: string;
  latitude: string;
  longitude: string;
}

export interface CreateOrderRequest {
  customer_id: number;
  delivery_date: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  is_simulated: number;
  status: 'ACTIVE';
}
