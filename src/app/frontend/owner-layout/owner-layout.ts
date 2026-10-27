import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLinkWithHref } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { CustomerDetailPanel } from '../owner-page/customer/customer-detail-panel/customer-detail-panel';
import { CustomerService } from '../../service/customer.service';
import { OrderSelectionService } from '../../service/order-selection.service';
import { OrderDetailPanel } from '../owner-page/order/order-detail-panel/order-detail-panel';
import { RouteDetailPage } from '../owner-page/route/route-detail-page/route-detail-page';
@Component({
  imports: [RouterOutlet, Sidebar, CustomerDetailPanel, OrderDetailPanel, RouterLinkWithHref, RouteDetailPage],
  providers: [CustomerService, OrderSelectionService],
  selector: 'app-owner-layout',
  styleUrl: './owner-layout.css',
  templateUrl: './owner-layout.html',
})
export class OwnerLayout {
  router = inject(Router);
  selectedItem: any;
  openlist = true;
  ownerCod = [16.246063, 103.252125];

  updateSelected(item: any) {
    this.selectedItem = item;
  } 
  
  ToggleOpenlist(){
    this.openlist = !this.openlist;
  }

}
