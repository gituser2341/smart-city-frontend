import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';

interface StatusMap { OPEN: number; IN_PROGRESS: number; RESOLVED: number }
interface DeptMap { WATER: number; ELECTRICITY: number; SANITATION: number; ROAD: number; }
interface PriorityMap { LOW: number; MEDIUM: number; HIGH: number; EMERGENCY: number; }

interface DashboardStats {
  totalComplaints: number;
  totalOfficers: number;
  totalCitizens: number;
  byStatus: StatusMap;
  byDepartment: DeptMap;
  byPriority: PriorityMap;
}

interface Complaint {
  id: number;
  title: string;
  description: string;
  status: keyof StatusMap;
  priority: keyof PriorityMap;
  department: keyof DeptMap;
  location?: string;
  deadline?: string;
}

interface Officer {
  id: number;
  name: string;
  email: string;
  department: string;
}

interface NewOfficer {
  name: string;
  email: string;
  password: string;
  department: string;
}

interface NewDH {
  name: string;
  email: string;
  password: string;
  department: string;
}

const DEFAULT_STATS: DashboardStats = {
  totalComplaints: 0, totalOfficers: 0, totalCitizens: 0,
  byStatus: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 },
  byDepartment: { WATER: 0, ELECTRICITY: 0, SANITATION: 0, ROAD: 0 },
  byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, EMERGENCY: 0 },
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class AdminComponent implements OnInit {

  stats: DashboardStats = { ...DEFAULT_STATS };
  complaints: Complaint[] = [];
  officers: Officer[] = [];
  activeTab = 'dashboard';
  coordinationRequests: any[] = [];

  newOfficer: NewOfficer = { name: '', email: '', password: '', department: '' };
  successMessage = '';
  errorMessage = '';
  
  newDH: NewDH = { name: '', email: '', password: '', department: '' };
  dhSuccessMessage = '';
  dhErrorMessage = '';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadStats();
    this.loadComplaints();
    this.loadOfficers();
    this.loadCoordinationRequests();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    if (!token) { this.router.navigate(['/login']); }
    return new HttpHeaders({
      'Authorization': 'Bearer ' + (token ?? ''),
      'Content-Type': 'application/json'
    });
  }

  loadStats(): void {
    this.http.get<DashboardStats>(
      'http://localhost:8080/api/admin/dashboard-stats',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.stats = {
          totalComplaints: data.totalComplaints ?? 0,
          totalOfficers: data.totalOfficers ?? 0,
          totalCitizens: data.totalCitizens ?? 0,
          byStatus: {
            OPEN: data.byStatus?.OPEN ?? 0,
            IN_PROGRESS: data.byStatus?.IN_PROGRESS ?? 0,
            RESOLVED: data.byStatus?.RESOLVED ?? 0,
          },
          byDepartment: {
            WATER: data.byDepartment?.WATER ?? 0,
            ELECTRICITY: data.byDepartment?.ELECTRICITY ?? 0,
            SANITATION: data.byDepartment?.SANITATION ?? 0,
            ROAD: data.byDepartment?.ROAD ?? 0,
          },
          byPriority: {
            LOW: data.byPriority?.LOW ?? 0,
            MEDIUM: data.byPriority?.MEDIUM ?? 0,
            HIGH: data.byPriority?.HIGH ?? 0,
            EMERGENCY: data.byPriority?.EMERGENCY ?? 0,
          }
        };
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Stats error:', err);
        if (err.status === 401) { this.router.navigate(['/login']); }
      }
    });
  }

  loadComplaints(): void {
    this.http.get<Complaint[]>(
      'http://localhost:8080/api/admin/all-complaints',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.complaints = data ?? []; this.cdr.detectChanges(); },
      error: (err) => {
        console.error('Complaints error:', err);
        if (err.status === 401) { this.router.navigate(['/login']); }
      }
    });
  }

  loadOfficers(): void {
    this.http.get<Officer[]>(
      'http://localhost:8080/api/admin/officers',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.officers = data ?? []; this.cdr.detectChanges(); },
      error: (err) => {
        console.error('Officers error:', err);
        if (err.status === 401) { this.router.navigate(['/login']); }
      }
    });
  }


  assignOfficer(complaintId: number, officerId: string): void {
    if (!officerId) { return; }
    this.http.put(
      `http://localhost:8080/api/admin/assign/${complaintId}?officerId=${officerId}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => { this.loadComplaints(); this.loadStats(); },
      error: (err) => { console.error('Assign error:', err); }
    });
  }

  addOfficer(): void {
    if (!this.newOfficer.name || !this.newOfficer.email ||
      !this.newOfficer.password || !this.newOfficer.department) {
      this.errorMessage = 'Please fill in all fields.';
      setTimeout(() => { this.errorMessage = ''; }, 3000);
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
        setTimeout(() => { this.successMessage = ''; }, 3000);
      },
      error: (err) => {
        this.errorMessage = (err.error as string) || 'Failed to add officer.';
        setTimeout(() => { this.errorMessage = ''; }, 3000);
      }
    });
  }

  // Add this method
addDH(): void {
  if (!this.newDH.name || !this.newDH.email || !this.newDH.password || !this.newDH.department) {
    this.dhErrorMessage = 'All fields are required.';
    setTimeout(() => { this.dhErrorMessage = ''; }, 3000);
    return;
  }

  this.http.post(
    'http://localhost:8080/api/admin/create-dh',
    this.newDH,
    { headers: this.getHeaders(), responseType: 'text' }
  ).subscribe({
    next: () => {
      this.dhSuccessMessage = 'Department head added successfully!';
      this.newDH = { name: '', email: '', password: '', department: '' };
      this.loadStats();
      setTimeout(() => { this.dhSuccessMessage = ''; }, 3000);
      this.cdr.detectChanges();
    },
    error: (err) => {
      this.dhErrorMessage = (err.error as string) || 'Failed to add department head.';
      setTimeout(() => { this.dhErrorMessage = ''; }, 3000);
      this.cdr.detectChanges();
    }
  });
}

  getTimeRemaining(deadline: string | undefined): string {
    if (!deadline) { return ''; }
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff < 0) {
      return `${Math.abs(Math.floor(diff / 3_600_000))}h overdue`;
    }
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  }

  getDeadlineStatus(deadline: string | undefined): string {
    if (!deadline) { return ''; }
    const diff = new Date(deadline).getTime() - Date.now();
    const hours = Math.floor(diff / 3_600_000);
    if (diff < 0) { return 'OVERDUE'; }
    if (hours < 4) { return 'CRITICAL'; }
    if (hours < 24) { return 'WARNING'; }
    return 'OK';
  }

  loadCoordinationRequests() {
    this.http.get<any[]>(
      'http://localhost:8080/api/admin/coordination-requests',
      { headers: this.getHeaders() }
    ).subscribe(res => {
      this.coordinationRequests = res;
    });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  approveCoordination(id: number) {
    this.http.post(
      `http://localhost:8080/api/admin/approve-request/${id}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe(() => {
      alert("✅ Approved");
      this.loadCoordinationRequests();
    });
  }

  rejectCoordination(id: number) {
    this.http.post(
      `http://localhost:8080/api/admin/reject-request/${id}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe(() => {
      alert("❌ Rejected");
      this.loadCoordinationRequests();
    });
  }

  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}