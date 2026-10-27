import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import type { DeliveryOrder, JobListItem, Preview, RiderJob, RouteLine, Settings } from './delivery-types';

@Component({
  imports: [FormsModule, DecimalPipe],
  selector: 'app-test-api',
  styleUrl: './test-api.css',
  templateUrl: './test-api.html',
})
export class TestApi implements OnInit, AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  @ViewChild('mapElement', { static: true }) mapElement!: ElementRef<HTMLDivElement>;
  private map: L.Map | null = null;
  private layer: L.FeatureGroup | null = null;
  private drawVersion = 0;
  readonly colors = ['#dc2626', '#2563eb', '#059669', '#9333ea', '#d97706', '#0891b2', '#be185d', '#4f46e5', '#65a30d', '#475569'];
  apiBase = 'http://localhost:3000';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly mapMessage = signal('');
  readonly orders = signal<DeliveryOrder[]>([]);
  readonly jobs = signal<JobListItem[]>([]);
  readonly dates = signal<{ delivery_date: string; total_orders: number; eligible_orders: number }[]>([]);
  readonly selected = signal<Set<number>>(new Set());
  readonly activePreview = signal<Preview | null>(null);
  readonly riderJob = signal<RiderJob | null>(null);
  workCode = '';
  settings: Settings = {
    delivery_date: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
    departure_time: '11:30', deadline_time: '12:30', origin: { latitude: null, longitude: null },
    speed_kmh: 30, service_minutes: 2, fixed_cost: 15, cost_per_km_per_box: 2, return_to_shop: false,
  };

  ngOnInit() {
    try {
      const saved = JSON.parse(localStorage.getItem('delivery-test-settings') ?? 'null');
      if (saved?.apiBase) this.apiBase = saved.apiBase;
      if (saved?.origin) this.settings.origin = saved.origin;
    } catch { /* A malformed local preference does not prevent testing. */ }
    void this.connect();
  }

  ngAfterViewInit() {
    this.map = L.map(this.mapElement.nativeElement).setView([16.25, 103.25], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(this.map);
    this.layer = L.featureGroup().addTo(this.map);
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.busy()) return;
      this.settings.origin = { latitude: Number(event.latlng.lat.toFixed(7)), longitude: Number(event.latlng.lng.toFixed(7)) };
      this.invalidatePlans();
      this.showOrigin();
    });
  }

  ngOnDestroy() { this.drawVersion++; this.map?.remove(); }

  private url(path: string) { return `${this.apiBase.trim().replace(/\/+$/, '')}/job-sheets${path}`; }
  private async perform(work: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await work(); }
    catch (error) {
      if (error instanceof HttpErrorResponse) {
        const details = error.error?.details;
        this.error.set((error.error?.error ?? 'เชื่อมต่อ Backend ไม่สำเร็จ ตรวจ URL และเปิด Backend ก่อน') +
          (Array.isArray(details) ? ' — ' + details.map((item: { order_id: number; reason: string }) => `#${item.order_id}: ${item.reason}`).join(', ') : ''));
      } else this.error.set(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally { this.busy.set(false); }
  }

  async connect() {
    this.invalidatePlans(); this.riderJob.set(null);
    await this.perform(async () => {
      this.dates.set(await firstValueFrom(this.http.get<{ delivery_date: string; total_orders: number; eligible_orders: number }[]>(this.url('/dates'))));
      if (!this.dates().some(item => item.delivery_date === this.settings.delivery_date) && this.dates()[0]) {
        this.settings.delivery_date = this.dates()[0]!.delivery_date;
      }
      await this.loadLists();
      this.rememberSettings();
    });
  }

  private rememberSettings() {
    try { localStorage.setItem('delivery-test-settings', JSON.stringify({ apiBase: this.apiBase, origin: this.settings.origin })); } catch { }
  }
  private async loadLists() {
    const date = encodeURIComponent(this.settings.delivery_date);
    const [orders, jobs] = await Promise.all([
      firstValueFrom(this.http.get<DeliveryOrder[]>(this.url(`/eligible-orders?date=${date}`))),
      firstValueFrom(this.http.get<JobListItem[]>(this.url(`?date=${date}`))),
    ]);
    this.orders.set(orders); this.jobs.set(jobs);
    this.selected.set(new Set(orders.slice(0, 30).map(order => order.order_id)));
  }
  connectionChanged() {
    this.invalidatePlans(); this.orders.set([]); this.jobs.set([]);
    this.selected.set(new Set()); this.riderJob.set(null); this.dates.set([]);
  }
  async reload() {
    this.invalidatePlans();
    await this.perform(async () => { await this.loadLists(); });
  }
  invalidatePlans() {
    this.activePreview.set(null);
    this.drawVersion++; this.layer?.clearLayers(); this.mapMessage.set('');
  }
  toggle(id: number, checked: boolean) {
    const selected = new Set(this.selected());
    if (checked) selected.add(id); else selected.delete(id);
    this.selected.set(selected); this.invalidatePlans();
  }
  selectAll(checked: boolean) {
    this.selected.set(new Set(checked ? this.orders().slice(0, 30).map(order => order.order_id) : []));
    this.invalidatePlans();
  }
  selectedBoxes() { return this.orders().filter(order => this.selected().has(order.order_id)).reduce((sum, order) => sum + Number(order.quantity), 0); }

  async calculate(alternative = false) {
    if (this.busy()) return;
    const current = this.activePreview();
    if (alternative && !current) return;
    if (!this.selected().size || this.selected().size > 30) { this.error.set('เลือกออเดอร์ 1–30 รายการ'); return; }
    if (this.settings.origin.latitude === null || this.settings.origin.longitude === null) {
      this.error.set('กรอกพิกัดร้าน หรือคลิกตำแหน่งร้านบนแผนที่'); return;
    }
    await this.perform(async () => {
      const preview = await firstValueFrom(this.http.post<Preview>(this.url('/preview'), {
        settings: this.settings, order_ids: [...this.selected()],
        previous_preview_id: current && Date.parse(current.expires_at) > Date.now()
          ? current.preview_id : undefined,
      }));
      this.activePreview.set(preview); this.rememberSettings();
      this.message.set('คำนวณแล้ว กรุณาตรวจแผนก่อนยืนยัน ยังไม่ได้สร้างใบงาน');
      void this.drawPreview(preview);
    });
  }
  async confirm() {
    const preview = this.activePreview();
    if (!preview || this.busy()) return;
    if (!window.confirm(`ยืนยันสร้าง ${preview.jobs.length} ใบงาน รวม ${preview.summary.total_orders} ออเดอร์?`)) return;
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ jobs: { job_id: number; job_code: string }[] }>(this.url('/confirm'), { preview_id: preview.preview_id }));
      this.invalidatePlans();
      this.message.set(`สร้างใบงานแล้ว: ${result.jobs.map(job => job.job_code).join(', ')}`);
      if (result.jobs[0]) this.workCode = result.jobs[0].job_code;
      await this.loadLists();
    });
  }

  async openJob(code = this.workCode) {
    this.workCode = code.trim();
    if (!this.workCode) { this.error.set('กรอกเลขใบงานก่อน'); return; }
    await this.perform(async () => {
      const job = await firstValueFrom(this.http.get<RiderJob>(this.url(`/by-code/${encodeURIComponent(this.workCode)}`)));
      this.riderJob.set(job); void this.drawRider(job);
    });
  }
  async start() {
    const job = this.riderJob(); if (!job) return;
    await this.perform(async () => {
      this.riderJob.set(await firstValueFrom(this.http.post<RiderJob>(this.url(`/by-code/${encodeURIComponent(job.job_code)}/start`), {})));
      await this.refreshJobs();
    });
  }
  async deliver(stopId: number) {
    const job = this.riderJob(); if (!job) return;
    await this.perform(async () => {
      const updated = await firstValueFrom(this.http.post<RiderJob>(this.url(`/by-code/${encodeURIComponent(job.job_code)}/stops/${stopId}/deliver`), {}));
      this.riderJob.set(updated); await this.refreshJobs();
      this.message.set(updated.completed_at ? 'ส่งครบทุกจุดและปิดงานแล้ว' : 'บันทึกส่งสำเร็จแล้ว');
    });
  }
  private async refreshJobs() {
    this.jobs.set(await firstValueFrom(this.http.get<JobListItem[]>(this.url(`?date=${encodeURIComponent(this.settings.delivery_date)}`))));
  }
  nextStopId() { return this.riderJob()?.stops.find(stop => !stop.delivered_at)?.stop_id; }
  stopOrder(stop: RiderJob['stops'][number]) { return stop.order ?? stop; }
  navigation(stop: RiderJob['stops'][number]) {
    const order = this.stopOrder(stop);
    return `https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}&travelmode=driving`;
  }
  status(job: Pick<JobListItem, 'completed_at' | 'started_at' | 'status'>) {
    return job.completed_at ? 'ส่งครบแล้ว' : job.started_at ? 'กำลังส่ง' : job.status === 'ISSUED' ? 'รอเริ่มงาน' : job.status;
  }
  time(value: string | null | undefined) { return value ? value.slice(11, 19) : '-'; }

  private showOrigin() {
    const origin = this.settings.origin;
    if (origin.latitude !== null && origin.longitude !== null) this.pin(Number(origin.latitude), Number(origin.longitude), 'ร้าน');
  }
  private pin(latitude: number, longitude: number, text: string) {
    if (!this.layer) return;
    L.circleMarker([latitude, longitude], { radius: 5 }).bindTooltip(text).addTo(this.layer);
  }
  private async drawPreview(preview: Preview) {
    const version = ++this.drawVersion;
    this.layer?.clearLayers(); this.mapMessage.set('กำลังโหลดเส้นทางตามถนน…');
    const origin = preview.settings.origin;
    if (origin.latitude === null || origin.longitude === null) return;
    this.pin(origin.latitude, origin.longitude, 'ร้าน');
    let failed = 0;
    for (const [index, job] of preview.jobs.entries()) {
      if (version !== this.drawVersion) return;
      job.stops.forEach(stop => this.pin(Number(stop.order.latitude), Number(stop.order.longitude), `ใบงาน ${index + 1} จุด ${stop.stop_sequence} • Order #${stop.order.order_id}`));
      const points = [origin, ...job.stops.map(stop => ({ latitude: Number(stop.order.latitude), longitude: Number(stop.order.longitude) }))];
      if (preview.settings.return_to_shop) points.push(origin);
      try {
        const route = await firstValueFrom(this.http.post<RouteLine>(this.url('/route'), { points }));
        if (version !== this.drawVersion) return;
        if (this.layer) L.geoJSON(route, { style: { color: this.colors[index % this.colors.length]!, weight: 4 } }).addTo(this.layer);
      } catch { failed++; }
      this.fitMap();
    }
    if (version === this.drawVersion) this.mapMessage.set(failed ? `โหลดเส้นทางไม่ได้ ${failed} ใบงาน กดแสดงแผนอีกครั้งเพื่อลองใหม่` : 'เส้นทางแยกสีตามใบงาน');
  }
  private async drawRider(job: RiderJob) {
    const version = ++this.drawVersion;
    this.layer?.clearLayers();
    if (!job.settings) { this.mapMessage.set('ใบงานเก่านี้ยังไม่มีข้อมูลพิกัดร้านที่บันทึกไว้'); return; }
    const points = [job.settings.origin, ...job.stops.map(stop => {
      const order = this.stopOrder(stop);
      this.pin(Number(order.latitude), Number(order.longitude), `จุด ${stop.stop_sequence}`);
      return { latitude: Number(order.latitude), longitude: Number(order.longitude) };
    })];
    if (job.settings.return_to_shop) points.push(job.settings.origin);
    this.mapMessage.set('กำลังโหลดเส้นทางใบงาน…');
    try {
      const route = await firstValueFrom(this.http.post<RouteLine>(this.url('/route'), { points }));
      if (version !== this.drawVersion) return;
      if (this.layer) L.geoJSON(route, { style: { color: '#2563eb', weight: 4 } }).addTo(this.layer);
      this.mapMessage.set(`เส้นทาง ${job.job_code}`); this.fitMap();
    } catch { if (version === this.drawVersion) this.mapMessage.set('โหลดเส้นทางไม่ได้ ลองเปิดใบงานอีกครั้ง'); }
  }
  private fitMap() { if (this.layer?.getLayers().length) this.map?.fitBounds(this.layer.getBounds().pad(0.15), { maxZoom: 16 }); }
}
