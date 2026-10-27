import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { CreateOrderRequest, OrderResponse } from '../model/order-response';
import { firstValueFrom, Subject } from 'rxjs';

@Injectable()
export class OrderSelectionService {
  readonly selectedOrder = signal<OrderResponse | null>(null);
  readonly orders = signal<OrderResponse[]>([]);
  changes = new Subject<string>();

  constructor(private http: HttpClient) {}

  // โหลดครั้งเดียวแล้วใช้ข้อมูลชุดเดียวกันทั้งรายชื่อและแผนที่
  async loadOrders(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<OrderResponse[]>('/api/orders/with-customers'),
      );
      this.setOrders(response);
      return true;
    } catch (error) {
      console.error('เรียกข้อมูล orders ไม่สำเร็จ', error);
      return false;
    }
  }

  setOrders(orders: OrderResponse[]) {
    this.orders.set(
      [...orders].sort((first, second) => first.order_id - second.order_id),
    );
    this.changes.next('loaded');
  }

  select(order: OrderResponse) {
    this.selectedOrder.set(order);
    this.changes.next('selected');
  }

  clearSelection() {
    this.selectedOrder.set(null);
    this.changes.next('selected');
  }

  async createOrder(order: CreateOrderRequest): Promise<number> {
    const response = await firstValueFrom(
      this.http.post<{ affected_row: number; last_idx: number }>('/api/orders', order),
    );
    return response.last_idx;
  }

  async deleteOrder(orderId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/orders/${orderId}`));
    if (this.selectedOrder()?.order_id === orderId) {
      this.selectedOrder.set(null);
    }
    this.setOrders(this.orders().filter((order) => order.order_id !== orderId));
  }

  // ค่าว่างและพิกัดที่ผิดจะไม่ถูกนำไปสร้างหมุด
  getCoordinates(order: OrderResponse): [number, number] | null {
    if (order.latitude == null || order.longitude == null) return null;
    if (String(order.latitude).trim() === '' || String(order.longitude).trim() === '') return null;
    const latitude = Number(order.latitude);
    const longitude = Number(order.longitude);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
    return [latitude, longitude];
  }
}
