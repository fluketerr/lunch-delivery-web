import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { JobSheetService } from '../../service/job-sheet.service';
export interface WorkTask {
  id: string;
  label: string;
  completed: boolean;
}

export interface DeliveryStop {
  id: string;
  customer: string;
  orderNumber: number;
  address: string;
  latitude: number;
  longitude: number;
  tasks: WorkTask[];
}

export interface RiderJob {
  dateLabel: string;
  pickupTasks: WorkTask[];
  stops: DeliveryStop[];
}

@Component({
  selector: 'app-rider-work',
  imports: [DatePipe],
  host: { class: 'block' },
  templateUrl: './rider-work.html',
  styleUrl: './rider-work.css',
})
export class RiderWork {
  private jobSheetService = inject(JobSheetService);
  private readonly route = inject(ActivatedRoute);
  readonly workNumber =
    this.route.snapshot.paramMap.get('workNumber') ??
    this.route.snapshot.queryParamMap.get('workNumber') ??
    '1';
  readonly job = signal<RiderJob>({
    dateLabel: '',
    pickupTasks: [],
    stops: [],
  });

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly startingJob = signal(false);
  readonly startError = signal('');
  readonly pickupSaved = signal(false);
  readonly deliveringStopId = signal<string | null>(null);
  readonly deliveryError = signal('');
  readonly jobCompleted = signal(false);
  readonly pickupComplete = computed(() => this.pickupSaved());
  readonly deliveryStarted = computed(() =>
    this.job().stops.some((stop) => stop.tasks.some((task) => task.completed)),
  );
  readonly completedOrders = computed(
    () => this.job().stops.filter((stop) => this.allComplete(stop.tasks)).length,
  );

  allComplete(tasks: WorkTask[]): boolean {
    return tasks.length > 0 && tasks.every((task) => task.completed);
  }

  togglePickup(taskId: string): void {
    // Once delivery has started, keep the pickup record completed.
    if (this.deliveryStarted()) return;
    this.job.update((job) => ({
      ...job,
      pickupTasks: job.pickupTasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  completePickup(): void {
    if (this.startingJob() || this.pickupSaved()) return;

    this.startingJob.set(true);
    this.startError.set('');

    this.jobSheetService.startJob(this.workNumber).subscribe({
      next: () => {
        this.pickupSaved.set(true);

        this.job.update((job) => ({
          ...job,
          pickupTasks: job.pickupTasks.map((task) => ({
            ...task,
            completed: true,
          })),
        }));

        this.startingJob.set(false);
      },
      error: () => {
        this.startError.set('บันทึกรับอาหารไม่สำเร็จ กรุณาลองอีกครั้ง');
        this.startingJob.set(false);
      },
    });
  }

  completeDelivery(stopId: string): void {
  if (!this.pickupComplete() || this.deliveringStopId() !== null) return;

  this.deliveringStopId.set(stopId);
  this.deliveryError.set('');

  this.jobSheetService.deliverStop(this.workNumber, stopId).subscribe({
    next: (data) => {
      this.jobCompleted.set(data.completed_at !== null);
      this.job.update((job) => ({
        ...job,
        stops: job.stops.map((stop) =>
          stop.id === stopId
            ? {
                ...stop,
                tasks: stop.tasks.map((task) => ({
                  ...task,
                  completed: true,
                })),
              }
            : stop,
        ),
      }));

      this.deliveringStopId.set(null);
    },
    error: () => {
      this.deliveryError.set('บันทึกส่งสำเร็จไม่สำเร็จ กรุณาลองอีกครั้ง');
      this.deliveringStopId.set(null);
    },
  });
}

 
  loadJob(): void {
  if (this.loading()) return;

  this.loading.set(true);
  this.loadError.set('');

  this.jobSheetService.getJob(this.workNumber).subscribe({
    next: (data) => {
        this.jobCompleted.set(data.completed_at !== null);
        this.pickupSaved.set(data.started_at !== null);
        this.job.set({
          dateLabel: data.delivery_date,
          pickupTasks: data.stops.map((stop) => ({
            id: `pickup-${stop.stop_id}`,
            label: `รับอาหารของ ${stop.name} จำนวน ${stop.quantity} กล่อง`,
            completed: data.started_at !== null,
          })),
          stops: data.stops.map((stop) => ({
            id: String(stop.stop_id),
            customer: stop.name,
            orderNumber: stop.order_id,
            address: stop.delivery_address,
            latitude: Number(stop.delivery_latitude),
            longitude: Number(stop.delivery_longitude),
            tasks: [
              {
                id: `deliver-${stop.stop_id}`,
                label: `ส่งอาหาร ${stop.quantity} กล่อง ให้ ${stop.name}`,
                completed: stop.delivered_at !== null,
              },
            ],
          })),
        });
      

      this.loading.set(false);
    },
    error: (error) => {
      if (error.status === 404) {
        this.loadError.set('ไม่พบใบงานรหัสนี้ กรุณาตรวจสอบรหัสอีกครั้ง');
      } else {
        this.loadError.set('โหลดใบงานไม่สำเร็จ กรุณาลองอีกครั้ง');
      }

      this.loading.set(false);
    },
  });
}

  getAllStopsMapUrl(): string {
  const stops = this.job().stops;
  if (stops.length === 0) return '';

  const points = stops.map(
    (stop) => `${stop.latitude},${stop.longitude}`,
  );

  const destination = points[points.length - 1];
  const waypoints = points.slice(0, -1).join('|');

  return 'https://www.google.com/maps/dir/?api=1'
    + '&travelmode=driving'
    + '&destination=' + encodeURIComponent(destination)
    + '&waypoints=' + encodeURIComponent(waypoints);
}

ngOnInit(): void {
  this.loadJob();
}
}
