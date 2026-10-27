import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CustomerRecord } from '../../../model/customer-response';
import { CustomerService, CustomerUpdate } from '../../../service/customer.service';

@Component({
  imports: [FormsModule],
  selector: 'app-customer',
  styleUrl: './customer.css',
  templateUrl: './customer.html',
  host: { class: 'z-1000 block w-full h-full' },
})
export class Customer implements OnDestroy {
  private dataSubscription: Subscription;
  editingCustomer: CustomerRecord | null = null;
  addingCustomer = false;
  notice = '';
  editForm: CustomerUpdate = this.emptyForm();
  saving = false;
  editError = '';
  private pickerMap?: L.Map;
  private pickerPin?: L.CircleMarker;

  @ViewChild('locationPicker')
  set locationPicker(element: ElementRef<HTMLDivElement> | undefined) {
    this.pickerMap?.remove();
    this.pickerMap = undefined;
    this.pickerPin = undefined;
    if (!element) return;
    const latitude = this.editForm.latitude;
    const longitude = this.editForm.longitude;
    const position: L.LatLngTuple = latitude !== null && longitude !== null
      ? [latitude, longitude] : [16.246, 103.25];
    this.pickerMap = L.map(element.nativeElement).setView(position, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.pickerMap);
    this.updatePickerPin();
    this.pickerMap.on('click', (event: L.LeafletMouseEvent) => {
      if (this.saving) return;
      this.editForm.latitude = Number(event.latlng.lat.toFixed(6));
      this.editForm.longitude = Number(event.latlng.lng.toFixed(6));
      this.updatePickerPin();
      this.changeDetector.markForCheck();
    });
  }

  updatePickerPin(): void {
    const { latitude, longitude } = this.editForm;
    if (!this.pickerMap) return;
    if (latitude === null || longitude === null || !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      this.pickerPin?.remove();
      this.pickerPin = undefined;
      return;
    }
    const position: L.LatLngTuple = [latitude, longitude];
    if (this.pickerPin) this.pickerPin.setLatLng(position);
    else this.pickerPin = L.circleMarker(position, {
      radius: 9, color: '#047857', fillColor: '#34d399', fillOpacity: 1,
    }).addTo(this.pickerMap);
  }

  constructor(
    public store: CustomerService,
    private changeDetector: ChangeDetectorRef,
  ) {

    this.dataSubscription = this.store.changes.subscribe(() => {
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.pickerMap?.remove();
    this.dataSubscription.unsubscribe();
  }

  openEdit(customer: CustomerRecord, event: Event): void {
    event.stopPropagation();
    if (this.saving) return;
    this.addingCustomer = false;
    this.editingCustomer = customer;
    this.editError = '';
    this.editForm = {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      latitude: customer.coordinates?.[0] ?? null,
      longitude: customer.coordinates?.[1] ?? null,
    };
  }

  closeEdit(): void {
    if (this.saving) return;
    this.editingCustomer = null;
    this.addingCustomer = false;
  }

  openAdd(): void {
    if (this.saving) return;
    this.editingCustomer = null;
    this.addingCustomer = true;
    this.editForm = { name: '', phone: '', address: '', latitude: null, longitude: null };
    this.editError = '';
    this.notice = '';
  }

  saveCustomer(): void {
    if (this.saving) return;
    const form = this.editForm;
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim()) {
      this.editError = 'กรุณากรอกชื่อ เบอร์โทรศัพท์ และที่อยู่ให้ครบ';
      return;
    }
    if (form.latitude === null || !Number.isFinite(form.latitude) || Math.abs(form.latitude) > 90 ||
        form.longitude === null || !Number.isFinite(form.longitude) || Math.abs(form.longitude) > 180) {
      this.editError = 'กรุณากรอกพิกัดให้ถูกต้อง';
      return;
    }
    if (!this.addingCustomer) {
      this.saveEdit();
      return;
    }
    this.saving = true;
    this.editError = '';
    const customer = { ...form, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() };
    this.store.createCustomer(customer).subscribe({
      next: () => {
        this.saving = false;
        this.addingCustomer = false;
        this.notice = 'เพิ่มลูกค้าแล้ว';
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.editError = 'เพิ่มลูกค้าไม่สำเร็จ กรุณาลองอีกครั้ง';
        this.changeDetector.markForCheck();
      },
    });
  }

  saveEdit(): void {
    if (!this.editingCustomer || this.saving || !this.editForm.name.trim() || !this.editForm.phone.trim() || !this.editForm.address.trim()) return;
    this.saving = true;
    this.editError = '';
    this.store.updateCustomer(this.editingCustomer, { ...this.editForm }).subscribe({
      next: () => {
        this.saving = false;
        this.editingCustomer = null;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.editError = 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง';
        this.changeDetector.markForCheck();
      },
    });
  }

  private emptyForm(): CustomerUpdate {
    return { name: '', phone: '', address: '', latitude: 0, longitude: 0 };
  }

  showAll(): void {
    this.store.showAllCustomers();
  }
}
