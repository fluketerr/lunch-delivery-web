import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { RouteService } from '../../../service/route.service';
import { PlanningOrder } from '../../../model/delivery-response';

@Component({
  imports: [],
  selector: 'app-route',
  styleUrl: './route.css',
  templateUrl: './route.html',
  host: { class: 'block w-full z-1000' },
})
export class Route {
  RouteService = inject(RouteService);
  // อ้าง signal ใน Service เดิม เมื่อ Component ถูกสร้างใหม่จึงยังอ่านแผนที่เก็บไว้ได้
  readonly previewPlan = this.RouteService.previewPlan;
  readonly jobs = this.RouteService.jobs;
  today = new Date();
  date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(this.today);

  constructor() {
    this.RouteService.showCreationPage();
  }

  async confirmPlan() {
    if (this.choosingOrders()) return;
    if (await this.RouteService.confirmPreview()) {
      this.RouteService.getEligibleJobs(this.date).subscribe({
        error: () =>
          this.RouteService.planMessage.set('บันทึกสำเร็จ แต่โหลดออเดอร์คงเหลือไม่สำเร็จ'),
      });
    }
  }

  jobLabel(index: number) {
    return this.previewPlan()
      ? index + 1
      : (this.RouteService.savedJobs()[index]?.job_code ?? index + 1);
  }

  jobStatus(index: number) {
    if (this.previewPlan()) return 'แผนตัวอย่าง';
    const job = this.RouteService.savedJobs()[index];
    return job?.completed_at ? 'ส่งครบแล้ว' : job?.started_at ? 'กำลังส่ง' : 'รอเริ่มงาน';
  }

  toggleCreateRoute() {
    // กันส่งคำขอซ้ำ แม้เรียกเมธอดโดยตรงระหว่างที่ API ยังทำงาน
    if (this.RouteService.isCreatingRoute() || this.choosingOrders()) return;
    this.RouteService.loadingPreview.set(true);
    this.RouteService.planMessage.set(null);
    this.RouteService.getEligibleJobs(this.date).subscribe({
      next: (orders) => {
        if (!orders.length) {
          this.RouteService.previewPlan.set(null);
          this.RouteService.createRoute.set(false);
          this.RouteService.loadingPreview.set(false);
          this.RouteService.planMessage.set('ไม่มีออเดอร์ที่พร้อมจัดงาน');
          this.RouteService.showCreationPage();
          return;
        }
        this.availableOrders.set([
          ...new Map(orders.map((order) => [order.order_id, order])).values(),
        ]);
        // เลือกรายการใน preview เดิมไว้ก่อน เฉพาะที่ Backend ยังให้จัดงานได้
        const currentIds =
          this.previewPlan()?.jobs.flatMap((job) => job.stops.map((stop) => stop.order.order_id)) ??
          [];
        const eligibleIds = new Set(orders.map((order) => order.order_id));
        this.selectedOrderIds.set(new Set(this.previewPlan()
          ? currentIds.filter((id) => eligibleIds.has(id))
          : this.availableOrders().slice(0, 30).map(order => order.order_id)));
        this.RouteService.loadingPreview.set(false);
        this.choosingOrders.set(true);
        this.orderDialog?.nativeElement.showModal();
      },
      error: (error) => {
        this.RouteService.loadingPreview.set(false);
        this.RouteService.planMessage.set(this.previewError(error, 'โหลดออเดอร์ไม่สำเร็จ'));
      },
    });
  }

  @ViewChild('orderDialog', { static: true }) orderDialog?: ElementRef<HTMLDialogElement>;
  readonly availableOrders = signal<PlanningOrder[]>([]);
  readonly selectedOrderIds = signal(new Set<number>());
  readonly choosingOrders = signal(false);

  toggleOrder(id: number, checked: boolean) {
    if (
      this.RouteService.isCreatingRoute() ||
      !this.availableOrders().some((order) => order.order_id === id)
    )
      return;
    const selected = new Set(this.selectedOrderIds());
    if (checked && selected.size >= 30) return;
    if (checked) selected.add(id);
    else selected.delete(id);
    this.selectedOrderIds.set(selected);
  }

  selectAllOrders() {
    if (this.RouteService.isCreatingRoute()) return;
    this.selectedOrderIds.set(
      new Set(
        this.availableOrders()
          .slice(0, 30)
          .map((order) => order.order_id),
      ),
    );
  }

  clearOrderSelection() {
    if (!this.RouteService.isCreatingRoute()) this.selectedOrderIds.set(new Set());
  }

  closeOrderForm() {
    this.choosingOrders.set(false);
    this.orderDialog?.nativeElement.close();
  }

  cancelOrderForm(event?: Event) {
    if (this.RouteService.isCreatingRoute()) {
      event?.preventDefault();
      return;
    }
    this.closeOrderForm();
    this.RouteService.planMessage.set(null);
  }

  // ส่งเฉพาะรายการที่ผู้ใช้เลือก ไม่เลือก 30 รายการแรกให้อัตโนมัติ
  calculateSelectedOrders(event?: Event) {
    event?.preventDefault();
    if (!this.choosingOrders() || this.RouteService.isCreatingRoute()) return;
    const orderIds = [...this.selectedOrderIds()];
    if (orderIds.length > 30) return;
    if (!orderIds.length) {
      if (!this.previewPlan()) return;
      // นำออกจาก preview เท่านั้น ไม่ลบออเดอร์หรือเปลี่ยนสถานะในฐานข้อมูล
      this.previewPlan.set(null);
      this.RouteService.createRoute.set(false);
      this.RouteService.confirmRoute.set(false);
      this.RouteService.planMessage.set(null);
      this.RouteService.showCreationPage();
      this.closeOrderForm();
      return;
    }
    this.RouteService.loadingPreview.set(true);
    this.RouteService.planMessage.set(null);
    const current = this.previewPlan();
    const previousId = current && Date.parse(current.expires_at) > Date.now()
      ? current.preview_id : undefined;
    this.RouteService.getPreviewPlan(orderIds, this.date, previousId).subscribe({
      next: (preview) => {
        this.RouteService.selectedJobIndex.set(null);
        this.previewPlan.set(preview);
        this.RouteService.createRoute.set(true);
        this.RouteService.planMessage.set(null);
        this.closeOrderForm();
        this.RouteService.confirmRoute.set(false);
        this.RouteService.confirmationUncertain.set(false);
        // เตรียมเส้นทางทุกใบงานไว้ใน service ให้หน้าแผนที่นำไปวาดต่อ
        this.RouteService.loadRouteLines(preview);
        this.RouteService.loadingPreview.set(false);
      },
      error: (error) => {
        this.RouteService.loadingPreview.set(false);
        this.RouteService.planMessage.set(this.previewError(error, 'โหลดแผนการขนส่งไม่สำเร็จ'));
        // รหัสเก่าหาย/หมดอายุ ให้กดคำนวณใหม่ได้โดยไม่ส่งรหัสที่ใช้ไม่ได้ซ้ำ
        if (error.status === 409) {
          this.previewPlan.set(null);
          this.RouteService.routeLines.set([]);
          this.RouteService.createRoute.set(false);
        }
      },
    });
  }

  // แสดงเหตุผลรายออเดอร์จาก Backend แทนการซ่อนรายละเอียดไว้ใน console
  private previewError(error: unknown, fallback: string): string {
    const body = (error as { error?: { error?: unknown; details?: unknown } } | null)?.error;
    const message = typeof body?.error === 'string' ? body.error : fallback;
    const details = Array.isArray(body?.details) ? body.details : [];
    return [
      message,
      ...details.flatMap((item) =>
        item && typeof item.reason === 'string'
          ? [`ออเดอร์ #${item.order_id ?? '-'}: ${item.reason}`]
          : [],
      ),
    ].join(' — ');
  }

  requestAlternativePlan() {
    const currentPlan = this.previewPlan();
    if (!currentPlan || this.RouteService.isCreatingRoute()) return;

    // อ่านออเดอร์จาก preview เดิม จึงยังใช้ได้แม้เปลี่ยนหน้าแล้วกลับมา
    const orderIds = currentPlan.jobs.flatMap((job) =>
      job.stops.map((stop) => stop.order.order_id),
    );
    this.RouteService.loadingPreview.set(true);
    this.RouteService.planMessage.set(null);
    this.RouteService.getPreviewPlan(
      orderIds,
      currentPlan.settings.delivery_date,
      currentPlan.preview_id,
      currentPlan.settings,
    ).subscribe({
      next: (preview) => {
        this.RouteService.selectedJobIndex.set(null);
        this.previewPlan.set(preview);
        this.RouteService.loadRouteLines(preview);
        this.RouteService.loadingPreview.set(false);
      },
      error: (error) => {
        // ไม่เปลี่ยน preview/เส้นทางเดิม เมื่อหาแผนอื่นไม่ได้หรือ API ล้มเหลว
        this.RouteService.planMessage.set(
          typeof error.error?.error === 'string'
            ? error.error.error
            : 'ขอแผนอื่นไม่สำเร็จ กรุณาลองอีกครั้ง',
        );
        this.RouteService.loadingPreview.set(false);
        if (error.status === 409) {
          this.previewPlan.set(null);
          this.RouteService.routeLines.set([]);
          this.RouteService.createRoute.set(false);
        }
      },
    });
  }

  selectJob(index: number): void {
    this.RouteService.selectedJobIndex.update((selectedIndex) =>
      selectedIndex === index ? null : index,
    );
  }

  onJobCardKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.selectJob(index);
  }
}
