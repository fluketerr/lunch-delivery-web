import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouteService } from './route.service';
import { DeliveryPlan } from '../model/delivery-response';

describe('Confirmation with saved map data', () => {
  let service: RouteService;
  let http: HttpTestingController;
  const settings = {
    delivery_date: '2026-10-22',
    origin: { latitude: 16.25, longitude: 103.25 },
    return_to_shop: false,
  };
  const preview = {
    preview_id: 'p1',
    expires_at: '2099-01-01T00:00:00Z',
    settings,
    jobs: [],
  } as unknown as DeliveryPlan;
  const saved = {
    job_id: 1,
    job_code: '012345',
    settings,
    totals: {
      total_boxes: 1,
      total_distance_km: 2,
      total_duration_minutes: 5,
      delivery_cost: 19,
      revenue: 65,
      food_cost: 40,
      profit: 6,
    },
    stops: [
      {
        stop_sequence: 1,
        estimated_arrival_at: '2026-10-22T04:35:00Z',
        order: { order_id: 1, name: 'A', quantity: 1, latitude: 16.26, longitude: 103.26 },
      },
    ],
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RouteService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function savedResponse() {
    http.expectOne('/api/job-sheets?date=2026-10-22').flush([{ job_code: '012345' }]);
    await Promise.resolve();
    http.expectOne('/api/job-sheets/by-code/012345').flush(saved);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  it('confirms once and resets creation without fetching saved jobs', async () => {
    service.previewPlan.set(preview);
    const work = service.confirmPreview();
    await service.confirmPreview();
    const request = http.expectOne('/api/job-sheets/confirm');
    expect(request.request.body).toEqual({ preview_id: 'p1' });
    request.flush({ jobs: [{ job_id: 1, job_code: '012345' }] });
    expect(await work).toBe(true);
    http.expectNone('/api/job-sheets?date=2026-10-22');
    expect(service.previewPlan()).toBeNull();
    expect(service.displayPlan()).toBeNull();
    expect(service.jobs()).toHaveLength(0);
    expect(service.routeLines()).toHaveLength(0);
    expect(service.createRoute()).toBe(false);
    expect(service.confirmRoute()).toBe(false);
  });
  it('restores saved jobs without a preview', async () => {
    service.viewingSaved.set(true);
    const work = service.loadSavedJobs('2026-10-22');
    await savedResponse();
    await work;
    http.expectOne('/api/job-sheets/route').flush({ type: 'LineString', coordinates: [] });
    expect(service.jobs()[0].stops[0].order.order_id).toBe(1);
  });
  it('discards rejected plans and reloads the saved list on conflict', async () => {
    service.previewPlan.set(preview);
    const work = service.confirmPreview();
    http
      .expectOne('/api/job-sheets/confirm')
      .flush({ error: 'Already assigned' }, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    http.expectNone('/api/job-sheets?date=2026-10-22');
    expect(await work).toBe(false);
    expect(service.previewPlan()).toBeNull();
    expect(service.createRoute()).toBe(false);
  });
  it('keeps saved data out of creation after leaving the new page', async () => {
    service.viewingSaved.set(true);
    const work = service.loadSavedJobs('2026-10-22');
    await savedResponse();
    await work;
    http.expectOne('/api/job-sheets/route').flush({ type: 'LineString', coordinates: [] });
    expect(service.jobs()).toHaveLength(1);
    service.showCreationPage();
    expect(service.jobs()).toHaveLength(0);
    expect(service.displayPlan()).toBeNull();
    expect(service.routeLines()).toHaveLength(0);
  });
  it('keeps confirmation actions available after visiting saved jobs with a pending preview', async () => {
    service.previewPlan.set(preview);
    service.createRoute.set(true);
    service.viewingSaved.set(true);
    const work = service.loadSavedJobs('2026-10-22');
    await savedResponse();
    await work;
    http.expectOne('/api/job-sheets/route').flush({ type: 'LineString', coordinates: [] });
    service.showCreationPage();
    expect(service.displayPlan()).toBe(preview);
    expect(service.createRoute()).toBe(true);
    expect(service.confirmRoute()).toBe(false);
    const confirmation = service.confirmPreview();
    http.expectOne('/api/job-sheets/confirm').flush({ jobs: [{ job_id: 1, job_code: '012345' }] });
    expect(await confirmation).toBe(true);
  });
});
