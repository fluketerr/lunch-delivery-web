import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OrderSelectionService } from '../../../service/order-selection.service';
import { CreateOrderRequest, OrderResponse } from '../../../model/order-response';
import { CustomerResponse } from '../../../model/customer-response';

@Component({
  imports: [FormsModule],
  selector: 'app-order',
  styleUrl: './order.css',
  templateUrl: './order.html',
  host: { class: 'block w-full h-full' },
})
export class Order {
  private readonly http = inject(HttpClient);
  private readonly orderSelection = inject(OrderSelectionService);
  addOrder = false;
  toggleDelete = false;
  orderForm = { customer_id: '', delivery_date: '', quantity: 1 };
  readonly customers = signal<CustomerResponse[]>([]);
  readonly customersLoading = signal(false);
  readonly customersError = signal('');
  readonly editError = signal('');
  readonly saving = signal(false);
  readonly createNotice = signal('');
  readonly orders = this.orderSelection.orders;
  readonly searchQuery = signal('');
  readonly filteredOrders = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.orders();

    return this.orders().filter(
      (order) =>
        `order #${order.order_id}`.includes(query) ||
        (order.name ?? '').toLowerCase().includes(query),
    );
  });
  readonly simulating = signal(false);
  readonly deletingOrderId = signal<number | null>(null);
  readonly deleteError = signal('');
  readonly deleteNotice = signal('');

  ngOnInit() {
    this.orderSelection.loadOrders();
  }

  selectOrder(order: OrderResponse) {
    this.orderSelection.select(order);
  }

  async deleteOrder(order: OrderResponse): Promise<void> {
    if (this.deletingOrderId() !== null || this.simulating() || this.saving()) return;
    if (!window.confirm(`ลบออเดอร์ #${order.order_id} ของ ${order.name} จำนวน ${order.quantity} กล่อง?\nเมื่อลบแล้วจะกู้คืนไม่ได้`)) return;

    this.deletingOrderId.set(order.order_id);
    this.deleteError.set('');
    this.deleteNotice.set('');
    try {
      await this.orderSelection.deleteOrder(order.order_id);
      this.deleteNotice.set(`ลบออเดอร์ #${order.order_id} แล้ว`);
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : null;
      this.deleteError.set(
        status === 409
          ? 'ออเดอร์นี้มีใบงานแล้ว ไม่สามารถลบได้'
          : status === 404
            ? 'ไม่พบออเดอร์นี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่'
            : 'ลบออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง',
      );
    } finally {
      this.deletingOrderId.set(null);
    }
  }

  async simulateOrders() {
    if (this.simulating() || this.deletingOrderId() !== null || this.saving()) return;

    this.simulating.set(true);
    try {
      await firstValueFrom(this.http.post('/api/orders/simulated', null));
      await this.orderSelection.loadOrders();
    } catch (error) {
      console.error('สร้าง simulated orders ไม่สำเร็จ', error);
    } finally {
      this.simulating.set(false);
    }
  }

  toggleAddOrder() {
    if (this.saving() || this.simulating() || this.deletingOrderId() !== null) return;
    this.addOrder = !this.addOrder;
    if (this.addOrder) {
      this.orderForm = {
        customer_id: '',
        delivery_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
        quantity: 1,
      };
      this.editError.set('');
      void this.loadCustomers();
    }
  }

  async loadCustomers(): Promise<void> {
    if (this.customersLoading()) return;
    this.customersLoading.set(true);
    this.customersError.set('');
    this.customers.set([]);
    try {
      const customers = await firstValueFrom(
        this.http.get<CustomerResponse[]>('/api/customers', { timeout: 60000 }),
      );
      if (!Array.isArray(customers)) throw new Error('Invalid customer response');
      this.customers.set(customers);
    } catch {
      this.customersError.set('โหลดรายชื่อลูกค้าไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      this.customersLoading.set(false);
    }
  }

  async saveOrder(): Promise<void> {
    if (this.saving() || this.customersLoading() || this.simulating() || this.deletingOrderId() !== null) return;
    this.editError.set('');

    const customerId = Number(this.orderForm.customer_id);
    const quantity = Number(this.orderForm.quantity);
    const date = this.orderForm.delivery_date;
    const customerExists = this.customers().some((customer) => Number(customer.customer_id) === customerId);
    if (!Number.isInteger(customerId) || customerId < 1 || !customerExists) {
      this.editError.set('กรุณาเลือกลูกค้า');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      this.editError.set('กรุณาเลือกวันที่จัดส่งให้ถูกต้อง');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 3) {
      this.editError.set('จำนวนกล่องต้องเป็นจำนวนเต็ม 1 ถึง 3 กล่อง');
      return;
    }

    const order: CreateOrderRequest = {
      customer_id: customerId,
      delivery_date: date,
      quantity,
      unit_price: 65,
      unit_cost: 40,
      is_simulated: 0,
      status: 'ACTIVE',
    };

    this.saving.set(true);
    this.createNotice.set('');
    this.deleteError.set('');
    this.deleteNotice.set('');
    try {
      const orderId = await this.orderSelection.createOrder(order);
      this.addOrder = false;
      this.createNotice.set(`เพิ่มออเดอร์ #${orderId} แล้ว`);

      const loaded = await this.orderSelection.loadOrders();
      if (!loaded) {
        this.createNotice.set('บันทึกออเดอร์แล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่');
        return;
      }
      const createdOrder = this.orders().find((item) => item.order_id === orderId);
      if (createdOrder) this.orderSelection.select(createdOrder);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        this.editError.set('ข้อมูลออเดอร์ไม่ถูกต้อง กรุณาตรวจสอบลูกค้า วันส่งและจำนวนกล่อง');
      } else {
        this.editError.set('เพิ่มออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    } finally {
      this.saving.set(false);
    }
  }

  toggleDeleteOrder(){
    this.toggleDelete =!this.toggleDelete;
  }

}
