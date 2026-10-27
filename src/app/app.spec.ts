import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CUSTOMERS_API_URL } from './service/customer.service';
import * as L from 'leaflet';
import { vi } from 'vitest';

function customerFixture() {
  return [
    {
      customer_id: 1,
      name: 'ทดสอบ A',
      phone: '0000000001',
      address: 'จุดส่ง A',
      latitude: '16.2461000',
      longitude: '103.2501000',
    },
    {
      customer_id: 2,
      name: 'ทดสอบ B',
      phone: '0000000002',
      address: 'จุดส่ง B',
      latitude: 16.247,
      longitude: 103.251,
    },
  ];
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('keeps the work number form at the home route', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input')?.getAttribute('placeholder')).toBe('กรอกเลขใบงาน');
    expect(compiled.querySelector('button')?.textContent).toContain('ยืนยัน');
  });

  it('keeps the rider work route available alongside the incoming routes', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/rider/67');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/rider/67');
    expect(compiled.querySelector('h1')?.textContent).toContain('งานส่งของวันนี้');
  });

  it('renders the incoming driver and owner pages at their routes', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const compiled = fixture.nativeElement as HTMLElement;
    await router.navigateByUrl('/driver-gui');
    await fixture.whenStable();
    expect(compiled.querySelector('app-rider-work')).toBeTruthy();
    expect(compiled.querySelector('h1')?.textContent).toContain('งานส่งของวันนี้');
    await router.navigateByUrl('/owner-gui');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(CUSTOMERS_API_URL).flush(customerFixture());
    await fixture.whenStable();
    expect(router.url).toBe('/owner/customer');
    expect(compiled.querySelector('app-owner-layout')).toBeTruthy();
    expect(compiled.querySelector('app-customer')).toBeTruthy();
    await router.navigateByUrl('/owner/order');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/orders/with-customers').flush([]);
    await fixture.whenStable();
    expect(compiled.querySelector('app-order')).toBeTruthy();
  });

  it('loads one customer request for the list and all map pins, and keeps pins when searching', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/owner/customer');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(CUSTOMERS_API_URL).flush(customerFixture());
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
    expect(compiled.querySelector('app-customer-detail-panel')?.textContent).toContain('2 หมุด');
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
    fitBounds.mockClear();
    compiled.querySelector<HTMLButtonElement>(
      'app-customer button[aria-label="แสดงตำแหน่งลูกค้าทั้งหมด"]',
    )!.click();
    expect(fitBounds).toHaveBeenCalledOnce();
    expect(fitBounds).toHaveBeenCalledWith(expect.anything(), {
      padding: [40, 40],
      maxZoom: 16,
    });

    compiled.querySelector<HTMLButtonElement>('button[aria-label="ดูตำแหน่ง ทดสอบ A"]')!.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.leaflet-popup-content')?.textContent).toContain('จุดส่ง A');

    const search = compiled.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'ทดสอบ B';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(compiled.querySelectorAll('app-customer button[aria-pressed]')).toHaveLength(1);
    expect(compiled.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
    await TestBed.inject(Router).navigateByUrl('/owner/order');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/orders/with-customers').flush([]);
    await fixture.whenStable();
    await TestBed.inject(Router).navigateByUrl('/owner/customer');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(compiled.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
  });

  it('keeps customers with missing or invalid coordinates in the list without creating false pins', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/owner/customer');
    fixture.detectChanges();
    const base = customerFixture()[0];
    TestBed.inject(HttpTestingController)
      .expectOne(CUSTOMERS_API_URL)
      .flush([
        { ...base, customer_id: 1, latitude: '0', longitude: '0' },
        { ...base, customer_id: 2, latitude: null },
        { ...base, customer_id: 3, latitude: '' },
        { ...base, customer_id: 4, longitude: '181' },
      ]);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('app-customer button[aria-pressed]')).toHaveLength(4);
    expect(compiled.querySelectorAll('app-customer button:disabled')).toHaveLength(3);
    expect(compiled.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
  });

  it('shows API errors, retries, and displays API text without interpreting HTML', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/owner/customer');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(CUSTOMERS_API_URL)
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[role=alert]')?.textContent).toContain(
      'โหลดข้อมูลลูกค้าไม่สำเร็จ',
    );
    compiled
      .querySelector<HTMLButtonElement>('app-customer-detail-panel [role=alert] button')!
      .click();
    http
      .expectOne(CUSTOMERS_API_URL)
      .flush([{ ...customerFixture()[0], name: '<img src=x onerror=alert(1)>' }]);
    await fixture.whenStable();
    compiled.querySelector<HTMLButtonElement>('app-customer button[aria-pressed]')!.click();
    await fixture.whenStable();
    expect(compiled.querySelector('.leaflet-popup-content')?.textContent).toContain(
      '<img src=x onerror=alert(1)>',
    );
    expect(compiled.querySelector('.leaflet-popup-content img')).toBeNull();
  });

  it('opens rider-work with the submitted work number', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector('input')!.value = '67';
    compiled.querySelector('button')!.click();
    await fixture.whenStable();
    expect(router.url).toBe('/rider/67');
    expect(compiled.querySelector('[data-testid=work-meta]')?.textContent).toContain('งาน 67');
    expect(compiled.querySelectorAll('input:disabled')).toHaveLength(4);

    compiled.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((input, index) => {
      if (index < 3) input.click();
    });
    await fixture.whenStable();
    expect(compiled.querySelectorAll('[data-testid=complete]')).toHaveLength(1);
    expect(compiled.querySelectorAll('input:disabled')).toHaveLength(0);
    compiled.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((input, index) => {
      if (index >= 3) input.click();
    });
    await fixture.whenStable();
    expect(compiled.querySelector('[role=status]')?.textContent).toContain('2 ออเดอร์ · 2 เสร็จ');
    expect(compiled.querySelectorAll('[data-testid=complete]')).toHaveLength(3);
  });

  it('shows order pins for 1, 2 and 3 boxes below the details and shares selection with the list', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/owner/order');
    fixture.detectChanges();
    const orders = [1, 2, 3].map((quantity) => ({
      ...customerFixture()[0],
      order_id: quantity,
      customer_id: quantity,
      delivery_date: '2026-10-16',
      quantity: quantity,
      unit_price: '100',
      unit_cost: '50',
      is_simulated: 0,
      status: 'pending',
      latitude: String(16.24 + quantity / 1000),
    }));
    TestBed.inject(HttpTestingController)
      .expectOne('/api/orders/with-customers')
      .flush([...orders, { ...orders[0], order_id: 4, latitude: '' }]);
    // loadOrders uses async/await; let it finish updating the shared orders before rendering.
    await Promise.resolve();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const panel = compiled.querySelector('app-order-detail-panel')!;
    expect(panel.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3);
    for (const quantity of [1, 2, 3]) {
      expect(panel.querySelector('img[src$="order-pin-' + quantity + '.svg"]')).toBeTruthy();
    }
    expect(panel.querySelector('[role=status]')?.textContent).toContain('3 หมุด');

    panel.querySelector<HTMLImageElement>('img[src$="order-pin-2.svg"]')!.click();
    await fixture.whenStable();
    expect(panel.querySelector('h3')?.textContent).toContain('Order #2');
    expect(panel.querySelector('.leaflet-popup-content')?.textContent).toContain('2 กล่อง');

    const thirdOrder = Array.from(
      compiled.querySelectorAll<HTMLButtonElement>('app-order button'),
    ).find((button) => button.textContent?.includes('Order #3'))!;
    thirdOrder.click();
    await fixture.whenStable();
    expect(panel.querySelector('h3')?.textContent).toContain('Order #3');
    expect(panel.querySelector('.leaflet-popup-content')?.textContent).toContain('3 กล่อง');
  });
});
