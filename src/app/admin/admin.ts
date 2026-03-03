import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

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
  escalatedComplaints: any[] = [];
  officers: any[] = [];
  activeTab: string = 'dashboard';

  newOfficer = { name: '', email: '', password: '', department: '' };
  successMessage = '';
  errorMessage = '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadStats();
    this.loadComplaints();
    this.loadOfficers();
    this.loadEscalated();
  }

  getHeaders() {
    return new HttpHeaders({
      Authorization: 'Bearer ' + localStorage.getItem('token')
    });
  }

  loadStats() {
    this.http.get<any>('http://localhost:8080/api/admin/dashboard-stats',
      { headers: this.getHeaders() }).subscribe(data => this.stats = data);
  }

  loadComplaints() {
    this.http.get<any[]>('http://localhost:8080/api/admin/all-complaints',
      { headers: this.getHeaders() }).subscribe(data => this.complaints = data);
  }

  loadOfficers() {
    this.http.get<any[]>('http://localhost:8080/api/admin/officers',
      { headers: this.getHeaders() }).subscribe(data => this.officers = data);
  }

  loadEscalated() {
    this.http.get<any[]>('http://localhost:8080/api/admin/escalated',
      { headers: this.getHeaders() }).subscribe(data => this.escalatedComplaints = data);
  }

  assignOfficer(complaintId: number, officerId: string) {
    if (!officerId) return;
    this.http.put(
      `http://localhost:8080/api/admin/assign/${complaintId}?officerId=${officerId}`,
      {}, { headers: this.getHeaders(), responseType: 'text' })
      .subscribe(() => {
        this.loadComplaints();
        this.loadEscalated();
        this.loadStats();
      });
  }

  addOfficer() {
    this.http.post(
      'http://localhost:8080/api/admin/add-officer',
      this.newOfficer,
      { headers: this.getHeaders(), responseType: 'text' })
      .subscribe({
        next: () => {
          this.successMessage = 'Officer added successfully!';
          this.newOfficer = { name: '', email: '', password: '', department: '' };
          this.loadOfficers();
          setTimeout(() => this.successMessage = '', 3000);
        },
        error: (err) => {
          this.errorMessage = err.error || 'Failed to add officer';
          setTimeout(() => this.errorMessage = '', 3000);
        }
      });
  }

  getDeadlineStatus(deadline: string): string {
    if (!deadline) return '';
    const now = new Date();
    const dl = new Date(deadline);
    const diff = dl.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (diff < 0) return 'OVERDUE';
    if (hours < 4) return 'CRITICAL';
    if (hours < 24) return 'WARNING';
    return 'OK';
  }

  getTimeRemaining(deadline: string): string {
    if (!deadline) return '';
    const now = new Date();
    const dl = new Date(deadline);
    const diff = dl.getTime() - now.getTime();
    if (diff < 0) {
      const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      return `${hours}h overdue`;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  }

  setTab(tab: string) {
    this.activeTab = tab;
  }

  logout() {
    localStorage.clear();
  }
}