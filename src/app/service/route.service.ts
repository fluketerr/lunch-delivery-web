import { HttpClient } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin, map } from 'rxjs';
import { RiderJob, JobListItem } from '../model/saved-delivery';
import {
  Coordinates,
  DeliveryPlan,
  PlanningOrder,
  PlanningSettings,
  PreviewJobRoute,
  RouteLine,
} from '../model/delivery-response';

@Injectable({
  providedIn: 'root',
})
export class RouteService {
  confirmRoute = signal(false);
  createRoute = signal(false);
  // เก็บแผนใน root service เพื่อให้เปลี่ยนหน้าแล้วข้อมูลยังอยู่
  readonly previewPlan = signal<DeliveryPlan | null>(null);
  // อ่านใบงานจากแผนโดยตรง ไม่ต้องเก็บและอัปเดต list ซ้ำอีกชุด
  readonly savedJobs = signal<RiderJob[]>([]);
  readonly savedPlan = signal<Pick<DeliveryPlan, 'settings' | 'jobs' | 'summary'> | null>(null);
  // แมพ การ์ด และแผงสรุปอ่านข้อมูลชุดเดียวกัน แต่ยืนยันได้เฉพาะ previewPlan
  readonly viewingSaved = signal(false);
  readonly displayPlan = computed(() =>
    this.viewingSaved() ? this.savedPlan() : this.previewPlan(),
  );
  private savedRequestVersion = 0;
  readonly jobs = computed(() => this.displayPlan()?.jobs ?? []);
  readonly confirming = signal(false);
  readonly loadingSaved = signal(false);
  readonly confirmationUncertain = signal(false);
  // ให้หน้าแผนที่อ่านข้อมูลจาก service นี้ได้ แม้เปลี่ยนหน้าแล้วกลับมา
  readonly routeLines = signal<PreviewJobRoute[]>([]);
  readonly selectedJobIndex = signal<number | null>(null);
  readonly loadingRoutes = signal(false);
  // ล็อกปุ่มตั้งแต่ดึงออเดอร์/คำนวณ preview จนโหลดเส้นทางครบ
  readonly loadingPreview = signal(false);
  readonly isCreatingRoute = computed(
    () => this.loadingPreview() || this.loadingRoutes() || this.confirming() || this.loadingSaved(),
  );
  readonly routeError = signal<string | null>(null);
  readonly planMessage = signal<string | null>(null);

  // อ่านใบงานจากฐานข้อมูลแล้วแปลงเป็นโครงสร้างเดิม ให้ UI และแมพทำงานต่อได้
  async loadSavedJobs(date: string) {
    const version = ++this.savedRequestVersion;
    this.loadingSaved.set(true);
    this.savedJobs.set([]);
    this.savedPlan.set(null);
    this.routeLines.set([]);
    this.loadingRoutes.set(false);
    try {
      const list = await firstValueFrom(
        this.http.get<JobListItem[]>(`/api/job-sheets?date=${encodeURIComponent(date)}`),
      );
      const saved = await Promise.all(
        list.map((item) =>
          firstValueFrom(
            this.http.get<RiderJob>(`/api/job-sheets/by-code/${encodeURIComponent(item.job_code)}`),
          ),
        ),
      );
      if (version !== this.savedRequestVersion) return false;
      if (saved.some((job) => !job.settings || !job.totals))
        throw new Error('Missing planning data');
      const jobs = saved.map((job) => ({
        ...job.totals!,
        stops: job.stops.map((stop) => {
          if (!stop.order) throw new Error('Missing order snapshot');
          return {
            order: stop.order,
            stop_sequence: stop.stop_sequence,
            distance_from_previous_km: 0,
            estimated_arrival_at: stop.estimated_arrival_at,
            estimated_departure_at: stop.estimated_arrival_at,
          };
        }),
      }));
      const total = (key: keyof NonNullable<RiderJob['totals']>) =>
        jobs.reduce((sum, job) => sum + Number(job[key]), 0);
      this.savedJobs.set(saved);
      this.selectedJobIndex.set(null);
      this.savedPlan.set(
        saved.length
          ? {
              settings: saved[0].settings!,
              jobs,
              summary: {
                total_orders: jobs.reduce((sum, job) => sum + job.stops.length, 0),
                total_boxes: total('total_boxes'),
                riders: jobs.length,
                total_distance_km: total('total_distance_km'),
                delivery_cost: total('delivery_cost'),
                revenue: total('revenue'),
                food_cost: total('food_cost'),
                profit: total('profit'),
              },
            }
          : null,
      );
      if (this.viewingSaved()) {
        this.routeLines.set([]);
        const plan = this.savedPlan();
        if (plan) this.loadRouteLines(plan);
      }
      return true;
    } catch {
      if (version !== this.savedRequestVersion) return false;
      this.planMessage.set(
        'โหลดใบงานจริงไม่สำเร็จ หรือใบงานเก่าไม่มีข้อมูลแผน กรุณาลองเปิดหน้านี้ใหม่',
      );
      return false;
    } finally {
      if (version === this.savedRequestVersion) this.loadingSaved.set(false);
    }
  }

  // ยืนยันทุกใบงานในแผนครั้งเดียว Backend เป็นผู้บันทึก transaction
  async confirmPreview() {
    const preview = this.previewPlan();
    if (!preview || this.isCreatingRoute() || this.confirmationUncertain()) return false;
    if (
      !Number.isFinite(Date.parse(preview.expires_at)) ||
      Date.parse(preview.expires_at) <= Date.now()
    ) {
      this.planMessage.set('แผนหมดอายุ กรุณาคำนวณใหม่');
      return false;
    }
    this.confirming.set(true);
    this.planMessage.set(null);
    let confirmed = false;
    try {
      const result = await firstValueFrom(
        this.http.post<{ jobs: { job_id: number; job_code: string }[] }>(
          '/api/job-sheets/confirm',
          { preview_id: preview.preview_id },
        ),
      );
      confirmed = true;
      this.previewPlan.set(null);
      this.routeLines.set([]);
      this.selectedJobIndex.set(null);
      this.confirmRoute.set(false);
      this.createRoute.set(false);
      this.loadingRoutes.set(false);
      this.routeError.set(null);
      this.confirmationUncertain.set(false);
      this.planMessage.set(
        'สร้างใบงานสำเร็จ: ' + result.jobs.map((job) => job.job_code).join(', '),
      );
    } catch (error: unknown) {
      const response = error as { status?: number; error?: { error?: string } };
      if (!response.status || response.status >= 500) {
        // อาจบันทึกแล้วแต่ response ไม่ถึง ห้ามยืนยันแผนเดิมซ้ำโดยอัตโนมัติ
        this.confirmationUncertain.set(true);
        this.planMessage.set('ยังไม่ทราบผลยืนยัน กรุณาตรวจใบงานที่บันทึกแล้วก่อนคำนวณใหม่');
      } else {
        this.planMessage.set(response.error?.error ?? 'ยืนยันไม่สำเร็จ กรุณาคำนวณใหม่');
        // แผนที่ Backend ปฏิเสธด้วย 409 ใช้ต่อไม่ได้ ให้กลับไปโหลดออเดอร์ล่าสุด
        if (response.status === 409) {
          this.previewPlan.set(null);
          this.routeLines.set([]);
          this.createRoute.set(false);
        }
      }
    } finally {
      // หน้าสร้างไม่โหลดใบงานจริงกลับมา แสดงข้อมูลนั้นเฉพาะหน้ารายการที่ยืนยันแล้ว
      this.confirming.set(false);
    }
    return confirmed;
  }

  // แยกข้อมูลที่แมพอ่านตามหน้า และกันคำขอเก่ากลับมาทับหลังออกจากหน้ารายการ
  showCreationPage() {
    this.savedRequestVersion++;
    this.loadingSaved.set(false);
    this.viewingSaved.set(false);
    // รายการที่ยืนยันแล้วเป็นอีกหน้า ไม่ใช่สถานะของ preview ที่ยังรอยืนยัน
    this.confirmRoute.set(false);
    this.createRoute.set(this.previewPlan() !== null);
    this.selectedJobIndex.set(null);
    this.routeLines.set([]);
    this.loadingRoutes.set(false);
    const plan = this.previewPlan();
    if (plan) this.loadRouteLines(plan);
  }

  constructor(private http: HttpClient) {}

  toggleConfirmRoute() {
    this.confirmRoute.update((current) => !current);
  }

  toggleCreateRoute() {
    this.createRoute.update((current) => !current);
  }

  getEligibleJobs(date: string) {
    return this.http.get<PlanningOrder[]>(`/api/job-sheets/eligible-orders?date=${date}`);
  }

  getRoute(points: Coordinates[]) {
    return this.http.post<RouteLine>('/api/job-sheets/route', { points });
  }

  loadRouteLines(preview: Pick<DeliveryPlan, 'settings' | 'jobs' | 'summary'>) {
    // ล้างเส้นของแผนเดิม เพื่อไม่ให้แผนที่นำไปใช้กับใบงานชุดใหม่
    this.routeLines.set([]);
    this.routeError.set(null);
    this.loadingRoutes.set(preview.jobs.length > 0);
    if (preview.jobs.length === 0) return;

    const requests = preview.jobs.map((job, jobIndex) => {
      // ส่งแยกทีละใบงาน: ร้าน → จุดส่งตามลำดับ → ร้าน (ถ้าเลือกกลับร้าน)
      const points = [
        preview.settings.origin,
        ...job.stops.map((stop) => ({
          latitude: stop.order.latitude,
          longitude: stop.order.longitude,
        })),
      ];
      if (preview.settings.return_to_shop) points.push(preview.settings.origin);

      return this.getRoute(points).pipe(map((line) => ({ jobIndex, line })));
    });

    // เก็บเมื่อครบทุกใบงาน โดย jobIndex ยังคงตรงกับลำดับการ์ด
    forkJoin(requests).subscribe({
      next: (routes) => {
        if (this.displayPlan() !== preview) return;
        this.routeLines.set(routes);
        this.loadingRoutes.set(false);
      },
      error: () => {
        if (this.displayPlan() !== preview) return;
        this.routeError.set('โหลดเส้นทางไม่ครบ กรุณาลองคำนวณแผนอีกครั้ง');
        this.loadingRoutes.set(false);
      },
    });
  }

  getPreviewPlan(
    orderIds: number[],
    deliveryDate: string,
    previousPreviewId?: string,
    settings?: PlanningSettings,
  ) {
    const requestBody = {
      order_ids: orderIds,
      // ขอแผนอื่นต้องใช้เงื่อนไขเดียวกับ preview เดิม
      settings: settings ?? {
        delivery_date: deliveryDate,
        origin: {
          latitude: 16.246063,
          longitude: 103.252125,
        },
        departure_time: '11:30',
        deadline_time: '12:30',
        speed_kmh: 30,
        service_minutes: 2,
        fixed_cost: 15,
        cost_per_km_per_box: 2,
        return_to_shop: false,
      },
      previous_preview_id: previousPreviewId,
    };

    return this.http.post<DeliveryPlan>('/api/job-sheets/preview', requestBody);
  }
}
