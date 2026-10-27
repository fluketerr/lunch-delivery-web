import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { RouteService } from '../../../../service/route.service';

@Component({
  imports: [],
  selector: 'app-route-detail-page',
  styleUrl: './route-detail-page.css',
  templateUrl: './route-detail-page.html',
  host: { class: 'z-10 block w-full h-full' },
})
export class RouteDetailPage implements AfterViewInit, OnDestroy {
  readonly RouteService = inject(RouteService);
  ownerCod = input<[number, number] | null>(null);
  readonly selectedJob = computed(() => {
    const selectedIndex = this.RouteService.selectedJobIndex();
    if (selectedIndex === null) return null;
    return this.RouteService.displayPlan()?.jobs[selectedIndex] ?? null;
  });
  readonly summary = computed(() => {
    const plan = this.RouteService.displayPlan();
    if (plan === null) return null;

    const job = this.selectedJob();
    if (job === null) return plan.summary;

    return {
      total_orders: job.stops.length,
      total_boxes: job.total_boxes,
      riders: 1,
      total_distance_km: job.total_distance_km,
      delivery_cost: job.delivery_cost,
      revenue: job.revenue,
      food_cost: job.food_cost,
      profit: job.profit,
    };
  });

  @ViewChild('mapContainer', { static: true })
  private mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private markerGroup: L.FeatureGroup | null = null;
  private orderMarkers: { orderId: number; marker: L.Marker }[] = [];
  pinCount = signal(0);

  private readonly defaultCenter: L.LatLngTuple = [16.246063, 103.252125];

  private readonly ownerPinIcon = L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48" aria-hidden="true" style="display:block;">
      <path fill="#d97706" stroke="#fff" stroke-width="2" d="M20 1C9.5 1 1 9.5 1 20c0 13 19 27 19 27s19-14 19-27C39 9.5 30.5 1 20 1Z"/>
      <g fill="#fff" transform="translate(8 8)">
        <path d="M22.3596 8.27L22.0696 5.5C21.6496 2.48 20.2796 1.25 17.3497 1.25H14.9896H13.5097H10.4697H8.98965H6.58965C3.64965 1.25 2.28965 2.48 1.85965 5.53L1.58965 8.28C1.48965 9.35 1.77965 10.39 2.40965 11.2C3.16965 12.19 4.33965 12.75 5.63965 12.75C6.89965 12.75 8.10965 12.12 8.86965 11.11C9.54965 12.12 10.7097 12.75 11.9997 12.75C13.2896 12.75 14.4197 12.15 15.1096 11.15C15.8797 12.14 17.0696 12.75 18.3096 12.75C19.6396 12.75 20.8396 12.16 21.5896 11.12C22.1896 10.32 22.4597 9.31 22.3596 8.27Z"/>
        <path d="M11.3491 16.6602C10.0791 16.7902 9.11914 17.8702 9.11914 19.1502V21.8902C9.11914 22.1602 9.33914 22.3802 9.60914 22.3802H14.3791C14.6491 22.3802 14.8691 22.1602 14.8691 21.8902V19.5002C14.8791 17.4102 13.6491 16.4202 11.3491 16.6602Z"/>
        <path d="M21.3709 14.3981V17.3781C21.3709 20.1381 19.1309 22.3781 16.3709 22.3781C16.1009 22.3781 15.8809 22.1581 15.8809 21.8881V19.4981C15.8809 18.2181 15.4909 17.2181 14.7309 16.5381C14.0609 15.9281 13.1509 15.6281 12.0209 15.6281C11.7709 15.6281 11.5209 15.6381 11.2509 15.6681C9.47086 15.8481 8.12086 17.3481 8.12086 19.1481V21.8881C8.12086 22.1581 7.90086 22.3781 7.63086 22.3781C4.87086 22.3781 2.63086 20.1381 2.63086 17.3781V14.4181C2.63086 13.7181 3.32086 13.2481 3.97086 13.4781C4.24086 13.5681 4.51086 13.6381 4.79086 13.6781C4.91086 13.6981 5.04086 13.7181 5.16086 13.7181C5.32086 13.7381 5.48086 13.7481 5.64086 13.7481C6.80086 13.7481 7.94086 13.3181 8.84086 12.5781C9.70086 13.3181 10.8209 13.7481 12.0009 13.7481C13.1909 13.7481 14.2909 13.3381 15.1509 12.5981C16.0509 13.3281 17.1709 13.7481 18.3109 13.7481C18.4909 13.7481 18.6709 13.7381 18.8409 13.7181C18.9609 13.7081 19.0709 13.6981 19.1809 13.6781C19.4909 13.6381 19.7709 13.5481 20.0509 13.4581C20.7009 13.2381 21.3709 13.7181 21.3709 14.3981Z"/>
      </g>
    </svg>`,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
  });

  constructor() {
    effect(() => {
      this.ownerCod();
      this.RouteService.displayPlan();
      this.RouteService.routeLines();
      this.RouteService.selectedJobIndex();
      this.drawOrderPins();
    });
  }

  ngAfterViewInit(): void {
    this.drawRoutes();
  }

  private drawRoutes(): void {
    if (this.map !== null) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: this.ownerCod() ?? this.defaultCenter,
      zoom: 14,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.markerGroup = L.featureGroup().addTo(this.map);
    this.drawOrderPins();

    setTimeout(() => {
      this.map?.invalidateSize();
      this.showAll();
    }, 100);
  }

  private drawOrderPins(): void {
    if (this.markerGroup === null) return;
    this.markerGroup.clearLayers();
    this.orderMarkers = [];
    this.pinCount.set(0);

    const ownerCoordinates = this.ownerCod();
    if (ownerCoordinates !== null) {
      const ownerMarker = L.marker(ownerCoordinates, {
        icon: this.ownerPinIcon,
        title: 'ร้านอาหาร',
        alt: 'ตำแหน่งร้านอาหาร',
      });
      this.markerGroup.addLayer(ownerMarker);
    }

    const plan = this.RouteService.displayPlan();
    if (plan === null) {
      this.showAll();
      return;
    }

    const origin: [number, number] = [
      plan.settings.origin.latitude,
      plan.settings.origin.longitude,
    ];
    if (ownerCoordinates === null) {
      this.markerGroup.addLayer(
        L.marker(origin, {
          icon: this.ownerPinIcon,
          title: 'จุดเริ่มต้นเส้นทาง',
          alt: 'จุดเริ่มต้นเส้นทาง',
        }),
      );
    }

    const routeLines = this.RouteService.routeLines();
    const selectedJobIndex = this.RouteService.selectedJobIndex();
    for (const [jobIndex, job] of plan.jobs.entries()) {
      if (selectedJobIndex !== null && selectedJobIndex !== jobIndex) continue;

      const route = routeLines.find((item) => item.jobIndex === jobIndex);
      if (route !== undefined) {
        const routeCoordinates = this.getRouteCoordinates(route.line);
        if (routeCoordinates.length > 1) {
          L.polyline(routeCoordinates, {
            color: this.getJobColor(jobIndex),
            weight: 4,
            opacity: 0.8,
          }).addTo(this.markerGroup);
        }
      }

      for (const [stopIndex, stop] of job.stops.entries()) {
        const coordinates: [number, number] = [stop.order.latitude, stop.order.longitude];
        const marker = L.marker(coordinates, {
          icon: L.icon({
            iconUrl: 'order-pin-' + ((stopIndex % 3) + 1) + '.svg',
            iconSize: [32, 40],
            iconAnchor: [16, 40],
          }),
          title: 'ใบงาน ' + (jobIndex + 1) + ' - Order #' + stop.order.order_id,
          alt: 'จุดส่งที่ ' + (stopIndex + 1) + ' ใบงาน ' + (jobIndex + 1),
        });
        this.markerGroup.addLayer(marker);
        this.orderMarkers.push({ orderId: stop.order.order_id, marker });
        this.pinCount.update((c) => c + 1);
      }
    }
    this.showAll();
  }

  private getRouteCoordinates(line: unknown): L.LatLngExpression[] {
    const route = line as {
      coordinates?: unknown;
      geometry?: { coordinates?: unknown };
      features?: { geometry?: { coordinates?: unknown } }[];
      routes?: { geometry?: { coordinates?: unknown } }[];
    };
    const coordinates =
      route?.coordinates ??
      route?.geometry?.coordinates ??
      route?.features?.[0]?.geometry?.coordinates ??
      route?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return [];

    return coordinates.flatMap((point): L.LatLngExpression[] => {
      if (
        Array.isArray(point) &&
        point.length >= 2 &&
        point.every((value) => typeof value === 'number')
      ) {
        // GeoJSON coordinates are [longitude, latitude].
        return [[point[1] as number, point[0] as number]];
      }
      if (
        typeof point === 'object' &&
        point !== null &&
        'latitude' in point &&
        'longitude' in point
      ) {
        const coordinate = point as { latitude: number; longitude: number };
        return [[coordinate.latitude, coordinate.longitude]];
      }
      return [];
    });
  }

  private getJobColor(index: number): string {
    const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
    return colors[index % colors.length];
  }

  showAll(): void {
    if (this.map === null || this.markerGroup === null) return;
    const bounds = this.markerGroup.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

  showAllRoutes(): void {
    this.RouteService.selectedJobIndex.set(null);
    this.showAll();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }
}