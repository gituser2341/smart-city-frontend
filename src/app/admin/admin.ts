import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class AdminComponent implements OnInit {

  stats: any = {
    totalComplaints: 0,
    totalOfficers: 0,
    totalCitizens: 0,
    byStatus: {
      OPEN: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      ESCALATED: 0
    },
    byDepartment: {
      WATER: 0,
      ELECTRICITY: 0,
      SANITATION: 0,
      ROAD: 0
    },
    byPriority: {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      EMERGENCY: 0
    }
  };

  complaints: any[]          = [];
  escalatedComplaints: any[] = [];
  officers: any[]            = [];
  activeTab                  = 'dashboard';

  newOfficer     = { name: '', email: '', password: '', department: '' };
  successMessage = '';
  errorMessage   = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadComplaints();
    this.loadOfficers();
    this.loadEscalated();
  }

  getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
    }
    return new HttpHeaders({
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json'
    });
  }

  loadStats() {
    this.http.get<any>(
      'http://localhost:8080/api/admin/dashboard-stats',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        // Merge so nested objects always exist
        this.stats = {
          totalComplaints: data.totalComplaints ?? 0,
          totalOfficers:   data.totalOfficers   ?? 0,
          totalCitizens:   data.totalCitizens   ?? 0,
          byStatus: {
            OPEN:        data.byStatus?.OPEN        ?? 0,
            IN_PROGRESS: data.byStatus?.IN_PROGRESS ?? 0,
            RESOLVED:    data.byStatus?.RESOLVED    ?? 0,
            ESCALATED:   data.byStatus?.ESCALATED   ?? 0,
          },
          byDepartment: {
            WATER:       data.byDepartment?.WATER       ?? 0,
            ELECTRICITY: data.byDepartment?.ELECTRICITY ?? 0,
            SANITATION:  data.byDepartment?.SANITATION  ?? 0,
            ROAD:        data.byDepartment?.ROAD        ?? 0,
          },
          byPriority: {
            LOW:       data.byPriority?.LOW       ?? 0,
            MEDIUM:    data.byPriority?.MEDIUM     ?? 0,
            HIGH:      data.byPriority?.HIGH       ?? 0,
            EMERGENCY: data.byPriority?.EMERGENCY  ?? 0,
          }
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Stats error:', err);
        if (err.status === 401) this.router.navigate(['/login']);
      }
    });
  }

  loadComplaints() {
    this.http.get<any[]>(
      'http://localhost:8080/api/admin/all-complaints',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.complaints = data ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Complaints error:', err);
        if (err.status === 401) this.router.navigate(['/login']);
      }
    });
  }

  loadOfficers() {
    this.http.get<any[]>(
      'http://localhost:8080/api/admin/officers',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.officers = data ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Officers error:', err);
        if (err.status === 401) this.router.navigate(['/login']);
      }
    });
  }

  loadEscalated() {
    this.http.get<any[]>(
      'http://localhost:8080/api/admin/escalated',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.escalatedComplaints = data ?? [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Escalated error:', err);
        if (err.status === 401) this.router.navigate(['/login']);
      }
    });
  }

  assignOfficer(complaintId: number, officerId: string) {
    if (!officerId) return;
    this.http.put(
      `http://localhost:8080/api/admin/assign/${complaintId}?officerId=${officerId}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => {
        this.loadComplaints();
        this.loadEscalated();
        this.loadStats();
      },
      error: (err) => console.error('Assign error:', err)
    });
  }

  addOfficer() {
    if (!this.newOfficer.name || !this.newOfficer.email ||
        !this.newOfficer.password || !this.newOfficer.department) {
      this.errorMessage = 'Please fill in all fields.';
      setTimeout(() => this.errorMessage = '', 3000);
      return;
    }

    this.http.post(
      'http://localhost:8080/api/admin/add-officer',
      this.newOfficer,
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => {
        this.successMessage = 'Officer added successfully!';
        this.newOfficer = { name: '', email: '', password: '', department: '' };
        this.loadOfficers();
        this.loadStats();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        this.errorMessage = err.error || 'Failed to add officer.';
        setTimeout(() => this.errorMessage = '', 3000);
      }
    });
  }

  getTimeRemaining(deadline: string): string {
    if (!deadline) return '';
    const now  = new Date();
    const dl   = new Date(deadline);
    const diff = dl.getTime() - now.getTime();
    if (diff < 0) {
      const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      return `${hours}h overdue`;
    }
    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  }

  getDeadlineStatus(deadline: string): string {
    if (!deadline) return '';
    const diff  = new Date(deadline).getTime() - new Date().getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (diff < 0)    return 'OVERDUE';
    if (hours < 4)   return 'CRITICAL';
    if (hours < 24)  return 'WARNING';
    return 'OK';
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}