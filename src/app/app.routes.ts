import { Routes } from '@angular/router';
import { WorkNumForm } from './frontend/work-num-form/work-num-form';
import { Customer } from './frontend/owner-page/customer/customer';
import { Order } from './frontend/owner-page/order/order';
import { OwnerLayout } from './frontend/owner-layout/owner-layout';
import { Route } from './frontend/owner-page/route/route';

export const routes: Routes = [
  { path: 'test-api', loadComponent: () => import('./frontend/test-api/test-api').then(m => m.TestApi) },
  { path: '', component: WorkNumForm },
  { path: 'work-num-form', component: WorkNumForm },
  { path: 'owner-gui', redirectTo: 'owner/customer', pathMatch: 'full' },
  { path: 'driver-gui', redirectTo: ({ queryParams }) => 'rider/' + encodeURIComponent(queryParams['workNumber'] || '1'), pathMatch: 'full' },
  {
    path: 'rider/:workNumber',
    loadComponent: () => import('./frontend/rider-work/rider-work').then((m) => m.RiderWork),
  },
  {
    path: 'owner',
    component: OwnerLayout,
    children: [
      { path: '', redirectTo: 'customer', pathMatch: 'full' },
      { path: 'customer', component: Customer },
      { path: 'order', component: Order },
      { path: 'route', component: Route },
      { path: 'confirmed-jobs', loadComponent: () => import('./frontend/owner-page/confirmed-jobs/confirmed-jobs').then(m => m.ConfirmedJobs) },
    ],
  },
];
