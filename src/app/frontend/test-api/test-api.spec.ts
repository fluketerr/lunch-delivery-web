import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestApi } from './test-api';
import type { Preview } from './delivery-types';

describe('Delivery planning test UI', () => {
  let component: TestApi;
  let http: HttpTestingController;
  const preview: Preview = {
    preview_id: 'preview-1', expires_at: '2099-01-01T00:00:00Z', method: 'test',
    settings: { delivery_date: '2026-10-05', departure_time: '11:30', deadline_time: '12:30',
      origin: { latitude: 16.25, longitude: 103.25 }, speed_kmh: 30, service_minutes: 2,
      fixed_cost: 15, cost_per_km_per_box: 2, return_to_shop: false },
    jobs: [], summary: { total_orders: 1, total_boxes: 1, riders: 1, total_distance_km: 1,
      delivery_cost: 17, revenue: 65, food_cost: 40, profit: 8 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    component = TestBed.runInInjectionContext(() => new TestApi());
    http = TestBed.inject(HttpTestingController);
    component.settings = structuredClone(preview.settings);
  });
  afterEach(() => { http.verify(); component.ngOnDestroy(); vi.restoreAllMocks(); });

  it('loads dates, eligible orders and issued jobs from the selected backend', async () => {
    const promise = component.connect();
    http.expectOne('http://localhost:3000/job-sheets/dates').flush([{ delivery_date: '2026-10-05', eligible_orders: 1, total_orders: 1 }]);
    await Promise.resolve();
    http.expectOne('http://localhost:3000/job-sheets/eligible-orders?date=2026-10-05').flush([{ order_id: 81, quantity: 3 }]);
    http.expectOne('http://localhost:3000/job-sheets?date=2026-10-05').flush([]);
    await promise;
    expect([...component.selected()]).toEqual([81]);
    expect(component.selectedBoxes()).toBe(3);
  });

  it('previews without confirming and clears stale plans after selection changes', async () => {
    component.selected.set(new Set([81]));
    const promise = component.calculate();
    const req = http.expectOne('http://localhost:3000/job-sheets/preview');
    expect(req.request.body.order_ids).toEqual([81]);
    req.flush(preview);
    await promise;
    expect(component.activePreview()?.preview_id).toBe('preview-1');
    http.expectNone('http://localhost:3000/job-sheets/confirm');
    component.toggle(81, false);
    expect(component.activePreview()).toBeNull();
  });

  it('keeps the current plan when no alternative is available', async () => {
    component.selected.set(new Set([81]));
    component.activePreview.set(preview);
    const promise = component.calculate(true);
    const req = http.expectOne('http://localhost:3000/job-sheets/preview');
    expect(req.request.body.previous_preview_id).toBe('preview-1');
    expect(req.request.body.exclude_signatures).toBeUndefined();
    req.flush({ error: 'ไม่พบแผนทางเลือก' }, { status: 422, statusText: 'Unprocessable Entity' });
    await promise;
    expect(component.activePreview()).toBe(preview);
    expect(component.error()).toContain('ไม่พบแผนทางเลือก');
  });

  it('confirms only the server preview ID and refreshes the remaining orders', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.activePreview.set(preview);
    const promise = component.confirm();
    const req = http.expectOne('http://localhost:3000/job-sheets/confirm');
    expect(req.request.body).toEqual({ preview_id: 'preview-1' });
    req.flush({ jobs: [{ job_id: 1, job_code: 'JOB-TEST' }] });
    await Promise.resolve();
    http.expectOne('http://localhost:3000/job-sheets/eligible-orders?date=2026-10-05').flush([]);
    http.expectOne('http://localhost:3000/job-sheets?date=2026-10-05').flush([]);
    await promise;
    expect(component.activePreview()).toBeNull();
    expect(component.workCode).toBe('JOB-TEST');
  });
});
