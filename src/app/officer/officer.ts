import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-officer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './officer.html',
  styleUrls: ['./officer.css']
})
export class OfficerComponent implements OnInit {

  complaints: any[] = [];
  officerName = '';
  total = 0;
  inProgress = 0;
  resolved = 0;
  isLoading = true;

  constructor(
    private http: HttpClient,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.officerName = localStorage.getItem('name') || 'Officer';
    this.loadComplaints();
  }

  loadComplaints() {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get<any[]>('http://localhost:8080/api/officer/complaints', { headers })
      .subscribe({
        next: (data) => {
          this.complaints = data.sort((a, b) => {
            const priorityOrder: any = { EMERGENCY: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          });
          this.total = data.length;
          this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved = data.filter(c => c.status === 'RESOLVED').length;
          this.isLoading = false;
        },
        error: (err) => {
          this.isLoading = false;
          if (err.status === 401) this.router.navigate(['/login']);
        }
      });
  }

  getSafeMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  updateStatus(complaintId: number, status: string) {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.put(
      `http://localhost:8080/api/officer/update-status/${complaintId}?status=${status}`,
      {},
      { headers, responseType: 'text' }
    ).subscribe({
      next: () => {
        const complaint = this.complaints.find(c => c.id === complaintId);
        if (complaint) {
          complaint.status = status;
          this.inProgress = this.complaints.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved = this.complaints.filter(c => c.status === 'RESOLVED').length;
        }
      },
      error: (err) => console.error('Update failed:', err)
    });
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}