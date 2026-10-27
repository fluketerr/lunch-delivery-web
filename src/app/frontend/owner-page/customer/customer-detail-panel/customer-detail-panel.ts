import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  effect,
  input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { CustomerRecord } from '../../../../model/customer-response';
import { CustomerService } from '../../../../service/customer.service';

@Component({
  selector: 'app-customer-detail-panel',
  templateUrl: './customer-detail-panel.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 pl-4' },
})
export class CustomerDetailPanel implements AfterViewInit, OnDestroy {
  ownerCod = input<[number, number] | null>(null);
  @ViewChild('mapContainer', { static: true }) private mapContainer!: ElementRef<HTMLDivElement>;
  private map: L.Map | null = null;
  private markerGroup: L.FeatureGroup | null = null;
  private dataSubscription: Subscription;
  private customerMarkers: { customerId: number | string; marker: L.Marker }[] = [];
  private pinIcon = L.icon({
    iconUrl: 'customer-pin.svg',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -35],
  });
  private ownerPinIcon = L.divIcon({
    className: '',
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48" aria-hidden="true" style="display:block;">
        <path fill="#d97706" stroke="#fff" stroke-width="2" d="M20 1C9.5 1 1 9.5 1 20c0 13 19 27 19 27s19-14 19-27C39 9.5 30.5 1 20 1Z"/>
        <g fill="#fff" transform="translate(8 8)">
          <path d="M22.3596 8.27L22.0696 5.5C21.6496 2.48 20.2796 1.25 17.3497 1.25H14.9896H13.5097H10.4697H8.98965H6.58965C3.64965 1.25 2.28965 2.48 1.85965 5.53L1.58965 8.28C1.48965 9.35 1.77965 10.39 2.40965 11.2C3.16965 12.19 4.33965 12.75 5.63965 12.75C6.89965 12.75 8.10965 12.12 8.86965 11.11C9.54965 12.12 10.7097 12.75 11.9997 12.75C13.2896 12.75 14.4197 12.15 15.1096 11.15C15.8797 12.14 17.0696 12.75 18.3096 12.75C19.6396 12.75 20.8396 12.16 21.5896 11.12C22.1896 10.32 22.4597 9.31 22.3596 8.27Z"/>
          <path d="M11.3491 16.6602C10.0791 16.7902 9.11914 17.8702 9.11914 19.1502V21.8902C9.11914 22.1602 9.33914 22.3802 9.60914 22.3802H14.3791C14.6491 22.3802 14.8691 22.1602 14.8691 21.8902V19.5002C14.8791 17.4102 13.6491 16.4202 11.3491 16.6602Z"/>
          <path d="M21.3709 14.3981V17.3781C21.3709 20.1381 19.1309 22.3781 16.3709 22.3781C16.1009 22.3781 15.8809 22.1581 15.8809 21.8881V19.4981C15.8809 18.2181 15.4909 17.2181 14.7309 16.5381C14.0609 15.9281 13.1509 15.6281 12.0209 15.6281C11.7709 15.6281 11.5209 15.6381 11.2509 15.6681C9.47086 15.8481 8.12086 17.3481 8.12086 19.1481V21.8881C8.12086 22.1581 7.90086 22.3781 7.63086 22.3781C4.87086 22.3781 2.63086 20.1381 2.63086 17.3781V14.4181C2.63086 13.7181 3.32086 13.2481 3.97086 13.4781C4.24086 13.5681 4.51086 13.6381 4.79086 13.6781C4.91086 13.6981 5.04086 13.7181 5.16086 13.7181C5.32086 13.7381 5.48086 13.7481 5.64086 13.7481C6.80086 13.7481 7.94086 13.3181 8.84086 12.5781C9.70086 13.3181 10.8209 13.7481 12.0009 13.7481C13.1909 13.7481 14.2909 13.3381 15.1509 12.5981C16.0509 13.3281 17.1709 13.7481 18.3109 13.7481C18.4909 13.7481 18.6709 13.7381 18.8409 13.7181C18.9609 13.7081 19.0709 13.6981 19.1809 13.6781C19.4909 13.6381 19.7709 13.5481 20.0509 13.4581C20.7009 13.2381 21.3709 13.7181 21.3709 14.3981Z"/>
        </g>
      </svg>
    `,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
  });

  constructor(
    public store: CustomerService,
    private changeDetector: ChangeDetectorRef,
  ) {
    effect(() => {
      this.ownerCod();
      this.drawCustomerPins();
    });

    this.dataSubscription = this.store.changes.subscribe((action) => {
      if (action === 'loaded') this.drawCustomerPins();
      if (action === 'selected') this.goToCustomer(this.store.selectedCustomer);
      if (action === 'show-all') this.showAll();
      this.changeDetector.markForCheck();
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement).setView([16.25, 103.25], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.markerGroup = L.featureGroup().addTo(this.map);
    this.drawCustomerPins();
    this.goToCustomer(this.store.selectedCustomer);
  }

  // ล้างหมุดเดิมแล้วสร้างจากลูกค้าที่มีพิกัด
  private drawCustomerPins(): void {
    if (this.markerGroup === null) return;
    this.markerGroup.clearLayers();
    this.customerMarkers = [];

    //ยืมมาวาดowner pinนะ
    const ownerCoordinates = this.ownerCod();
    if (ownerCoordinates !== null) {
      const ownerMarker = L.marker(ownerCoordinates, {
        icon: this.ownerPinIcon,
        title: 'ร้านอาหาร',
        alt: 'ตำแหน่งร้านอาหาร',
      });
      this.markerGroup.addLayer(ownerMarker);
    }

    for (const customer of this.store.locatedCustomers) {
      if (customer.coordinates === null) continue;
      const marker = L.marker(customer.coordinates, {
        icon: this.pinIcon,
        title: customer.name,
        alt: 'ตำแหน่งลูกค้า ' + customer.name,
      });
      marker.bindPopup(this.createPopup(customer));
      marker.on('click', () => this.store.selectCustomer(customer));
      this.markerGroup.addLayer(marker);
      this.customerMarkers.push({ customerId: customer.id, marker: marker });
    }
    this.showAll();
  }

  private goToCustomer(customer: CustomerRecord | null): void {
    if (customer === null || customer.coordinates === null || this.map === null) return;
    let zoom = 16;
    if (this.map.getZoom() > zoom) zoom = this.map.getZoom();
    this.map.setView(customer.coordinates, zoom);
    for (const item of this.customerMarkers) {
      if (item.customerId === customer.id) {
        item.marker.openPopup();
        break;
      }
    }
  }

  showAll(): void {
    if (this.map === null || this.markerGroup === null) return;
    const bounds = this.markerGroup.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }

  private createPopup(customer: CustomerRecord): HTMLElement {
    const popup = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = customer.name;
    popup.appendChild(name);

    // แสดงข้อมูล API เป็นข้อความ เพื่อไม่ให้ถูกตีความเป็น HTML
    for (const value of [customer.address, customer.phone]) {
      if (!value) continue;
      const line = document.createElement('p');
      line.textContent = value;
      popup.appendChild(line);
    }
    return popup;
  }

  ngOnDestroy(): void {
    this.dataSubscription.unsubscribe();
    if (this.map) this.map.remove();
  }
}
