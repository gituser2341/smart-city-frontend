import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class AdminComponent implements OnInit {

  stats: any = {};
  complaints: any[] = [];
  officers: any[] = [];
  selectedOfficerId: any = {};
  isLoading = true;
  activeTab = 'dashboard';
  errorMessage = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef  // ← ADD
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadComplaints();
    this.loadOfficers();
  }

  getHeaders() {
    const token = localStorage.getItem('token');
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  loadStats() {
    this.http.get<any>('http://localhost:8080/api/admin/dashboard-stats',  // ← FIXED
      { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.stats = data;
          this.isLoading = false;
          this.cdr.detectChanges();  // ← ADD
        },
        error: (err) => {
          console.error('❌ Stats error:', err.status, err.message);
          this.isLoading = false;
          this.errorMessage = `Error ${err.status}: ${err.status === 403 ? 'Access denied — role issue' : err.message}`;
          if (err.status === 401) this.router.navigate(['/login']);
          this.cdr.detectChanges();  // ← ADD
        }
      });
  }

  loadComplaints() {
    this.http.get<any[]>('http://localhost:8080/api/admin/all-complaints',  // ← FIXED
      { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.complaints = data;
          this.cdr.detectChanges();  // ← ADD
        },
        error: (err) => console.error('Complaints error:', err.status)
      });
  }

  loadOfficers() {
    this.http.get<any[]>('http://localhost:8080/api/admin/officers',
      { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.officers = data;
          this.cdr.detectChanges();  // ← ADD
        },
        error: (err) => console.error('Officers error:', err.status)
      });
  }

  assignOfficer(complaintId: number) {
    const officerId = this.selectedOfficerId[complaintId];
    if (!officerId) return;

    this.http.put(
      `http://localhost:8080/api/admin/assign/${complaintId}?officerId=${officerId}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' as 'json' }
    ).subscribe({
      next: () => {
        const c = this.complaints.find(x => x.id === complaintId);
        if (c) {
          const officer = this.officers.find(o => o.id == officerId);
          c.assignedOfficer = officer;
          c.status = 'IN_PROGRESS';
        }
        this.cdr.detectChanges();  // ← ADD
      },
      error: (err) => console.error('Assign error:', err)
    });
  }

  getBarWidth(value: number, max: number): string {
    if (!max) return '0%';
    return `${Math.round((value / max) * 100)}%`;
  }

  getMaxDept(): number {
    if (!this.stats.byDepartment) return 1;
    return Math.max(...Object.values(this.stats.byDepartment) as number[]);
  }

  getMaxPriority(): number {
    if (!this.stats.byPriority) return 1;
    return Math.max(...Object.values(this.stats.byPriority) as number[]);
  }

  setTab(tab: string) { this.activeTab = tab; }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}