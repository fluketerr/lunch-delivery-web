import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'app-work-num-form',
  styleUrl: './work-num-form.css',
  templateUrl: './work-num-form.html',
})
export class WorkNumForm {

  secretKey: string = 'iwantA';

  constructor(private router: Router) {}

  secretOwnerPage(workNumInput: HTMLInputElement) {
    if (workNumInput.value === this.secretKey) {
      void this.router.navigateByUrl('/owner/customer');
    } else {
      void this.router.navigate(['/rider', workNumInput.value.trim() || '1']);
    }
  }

}
