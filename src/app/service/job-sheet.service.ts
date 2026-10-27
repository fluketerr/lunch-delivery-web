import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { JobSheetResponse } from '../model/job-sheet-response';

@Injectable({
  providedIn: 'root',
})
export class JobSheetService {
  private http = inject(HttpClient);

  getJob(code: string) {
    return this.http.get<JobSheetResponse>(`/api/job-sheets/by-code/${encodeURIComponent(code)}`);
  }
  startJob(code: string) {
    return this.http.post<JobSheetResponse>(
      `/api/job-sheets/by-code/${encodeURIComponent(code)}/start`,
      {},
    );
  }

  deliverStop(code: string, stopId: string) {
    return this.http.post<JobSheetResponse>(
      `/api/job-sheets/by-code/${encodeURIComponent(code)}/stops/${encodeURIComponent(stopId)}/deliver`,
      {},
    );
  }
}
