import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Route } from './route';
import { DeliveryPlan } from '../../../model/delivery-response';

describe('Order selection form', () => {
  let component: Route;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    component = TestBed.runInInjectionContext(() => new Route());
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function open() {
    component.toggleCreateRoute();
    http
      .expectOne(`/api/job-sheets/eligible-orders?date=${component.date}`)
      .flush(Array.from({ length: 52 }, (_, i) => ({ order_id: i + 1 })));
  }
  it('waits for selection and sends only selected IDs, retaining selection on validation error', () => {
    open();
    expect(component.choosingOrders()).toBe(true);
    expect(component.selectedOrderIds().size).toBe(30);
    component.clearOrderSelection();
    component.calculateSelectedOrders();
    http.expectNone('/api/job-sheets/preview');
    component.toggleOrder(8, true);
    component.toggleOrder(40, true);
    component.calculateSelectedOrders();
    const request = http.expectOne('/api/job-sheets/preview');
    expect(request.request.body.order_ids).toEqual([8, 40]);
    request.flush(
      { error: 'Cannot plan', details: [{ order_id: 8, reason: 'Outside area' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(component.RouteService.planMessage()).toContain('#8: Outside area');
    expect(component.selectedOrderIds().size).toBe(2);
    expect(component.choosingOrders()).toBe(true);
  });
  it('enforces 30 selections but permits replacing an order', () => {
    open();
    for (let id = 1; id <= 31; id++) component.toggleOrder(id, true);
    expect(component.selectedOrderIds().size).toBe(30);
    expect(component.selectedOrderIds().has(31)).toBe(false);
    component.toggleOrder(1, false);
    component.toggleOrder(31, true);
    expect(component.selectedOrderIds().size).toBe(30);
    expect(component.selectedOrderIds().has(31)).toBe(true);
    component.toggleOrder(99, true);
    expect(component.selectedOrderIds().has(99)).toBe(false);
  });
  it('preselects current orders and lets removed orders be selected again', () => {
    const original = {
      jobs: [{ stops: [{ order: { order_id: 1 } }, { order: { order_id: 2 } }] }],
    } as DeliveryPlan;
    component.previewPlan.set(original);
    open();
    expect([...component.selectedOrderIds()]).toEqual([1, 2]);
    component.toggleOrder(1, false);
    component.toggleOrder(3, true);
    component.calculateSelectedOrders();
    const request = http.expectOne('/api/job-sheets/preview');
    expect(request.request.body.order_ids).toEqual([2, 3]);
    request.flush({ preview_id: 'edited', jobs: [], settings: {}, summary: {} });
    // Opening again fetches eligible orders, including the one removed from the draft.
    open();
    component.clearOrderSelection();
    expect(component.availableOrders().some((order) => order.order_id === 1)).toBe(true);
    component.toggleOrder(1, true);
    expect(component.selectedOrderIds().has(1)).toBe(true);
    http.expectNone('/api/job-sheets/confirm');
  });
  it('allows removing all draft orders without deleting database orders', () => {
    component.previewPlan.set({ jobs: [{ stops: [{ order: { order_id: 1 } }] }] } as DeliveryPlan);
    open();
    component.clearOrderSelection();
    component.calculateSelectedOrders();
    expect(component.previewPlan()).toBeNull();
    expect(component.RouteService.createRoute()).toBe(false);
    http.expectNone('/api/job-sheets/preview');
    http.expectNone('/api/job-sheets/confirm');
  });
  it('cancels without calculating and closes after a successful preview', () => {
    open();
    component.toggleOrder(1, true);
    component.cancelOrderForm();
    component.calculateSelectedOrders();
    http.expectNone('/api/job-sheets/preview');
    open();
    component.clearOrderSelection();
    component.toggleOrder(2, true);
    component.calculateSelectedOrders();
    http
      .expectOne('/api/job-sheets/preview')
      .flush({ preview_id: 'new', jobs: [], summary: {}, settings: {} });
    expect(component.choosingOrders()).toBe(false);
    expect(component.previewPlan()?.preview_id).toBe('new');
  });

  function currentPreview(): DeliveryPlan {
    const orders = [1, 2].map(order_id => ({
      order_id, customer_id: order_id, delivery_date: '2026-10-22', quantity: 1,
      unit_price: 65, unit_cost: 40, status: 'ACTIVE', name: 'ทดสอบ', phone: '', address: '',
      latitude: 16.25, longitude: 103.25,
    }));
    return {
      preview_id: 'current', expires_at: '2099-01-01T00:00:00Z', method: 'Greedy',
      settings: { delivery_date: '2026-10-22', departure_time: '11:00', deadline_time: '12:00',
        origin: { latitude: 16.25, longitude: 103.25 }, speed_kmh: 25, service_minutes: 3,
        fixed_cost: 15, cost_per_km_per_box: 2, return_to_shop: false },
      jobs: [{ stops: orders.map((order, index) => ({ order, stop_sequence: index + 1,
        distance_from_previous_km: 1, estimated_arrival_at: '', estimated_departure_at: '' })),
        total_boxes: 2, total_distance_km: 2, total_duration_minutes: 8, delivery_cost: 23,
        revenue: 130, food_cost: 80, profit: 27 }],
      summary: { total_orders: 2, total_boxes: 2, riders: 1, total_distance_km: 2,
        delivery_cost: 23, revenue: 130, food_cost: 80, profit: 27 },
    };
  }

  it('sends only the current preview ID, keeps the plan on failure and prevents duplicate clicks', () => {
    const current = currentPreview();
    component.previewPlan.set(current);
    component.requestAlternativePlan();
    component.requestAlternativePlan();
    const request = http.expectOne('/api/job-sheets/preview');
    expect(request.request.body).toEqual({ order_ids: [1, 2], settings: current.settings,
      previous_preview_id: 'current' });
    expect(component.previewPlan()).toBe(current);
    request.flush({ error: 'ไม่พบแผนที่ต่าง' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(component.previewPlan()).toBe(current);
    expect(component.RouteService.loadingPreview()).toBe(false);
    expect(component.RouteService.planMessage()).toContain('ไม่พบแผนที่ต่าง');
  });

  it('can change plans more than 20 times, replacing only the current ID and refreshing route data', () => {
    component.previewPlan.set(currentPreview());
    for (let index = 0; index < 22; index++) {
      const current = component.previewPlan()!;
      component.requestAlternativePlan();
      const request = http.expectOne('/api/job-sheets/preview');
      expect(request.request.body.previous_preview_id).toBe(current.preview_id);
      expect(request.request.body.exclude_signatures).toBeUndefined();
      request.flush({ ...current, preview_id: `new-${index}` });
      expect(component.previewPlan()?.preview_id).toBe(`new-${index}`);
      expect(component.RouteService.isCreatingRoute()).toBe(true);
      http.expectOne('/api/job-sheets/route').flush({ type: 'LineString', coordinates: [[103.25, 16.25], [103.251, 16.251]] });
      expect(component.RouteService.isCreatingRoute()).toBe(false);
    }
  });

  it('sends the existing ID when editing a live draft so the backend can remove that draft after success', () => {
    component.previewPlan.set(currentPreview());
    open();
    component.calculateSelectedOrders();
    const request = http.expectOne('/api/job-sheets/preview');
    expect(request.request.body.previous_preview_id).toBe('current');
    request.flush({ error: 'test' }, { status: 422, statusText: 'Unprocessable Entity' });
  });
});
