import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';  // For *ngFor etc. in template

@Component({
  selector: 'app-officer',
  standalone: true,  // Add if not present
  imports: [CommonModule],  // Add modules used in template
  templateUrl: './officer.html',
  styleUrl: './officer.css',
})
export class OfficerComponent implements OnInit {
  complaints: any[] = [];
  private http = inject(HttpClient);  // Inject HttpClient using inject()

  ngOnInit() {
    this.http.get<any[]>('http://localhost:8080/api/officer/complaints')
      .subscribe(data => {
        this.complaints = data;
      });
  }

  updateStatus(id: number, status: string) {
    this.http.put(
      `http://localhost:8080/api/officer/update-status/${id}?status=${status}`, 
      {}
    ).subscribe(() => {
      this.ngOnInit();  // Reload data
    });
  }
}
