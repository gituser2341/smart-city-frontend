import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

interface ComplaintUser {
  name: string;
}

interface Complaint {
  id: number;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  department: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  user?: ComplaintUser;
}

interface PerformanceMetric {
  label: string;
  value: number;
}

const PRIORITY_ORDER: Record<string, number> = {
  EMERGENCY: 0, HIGH: 1, MEDIUM: 2, LOW: 3
};

@Component({
  selector: 'app-officer',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './officer.html',
  styleUrls: ['./officer.css']
})
export class OfficerComponent implements OnInit {

  complaints: Complaint[] = [];
  officerName = '';
  total = 0;
  inProgress = 0;
  resolved = 0;
  isLoading = true;

  performanceScore = 0;
  scoreDashOffset = 314;
  scoreColor = '#3b5bdb';
  scoreStatus = '';
  scoreStatusClass = '';
  scoreTrend = 0;
  commendations = 0;
  incidents = 0;
  resolutionRate = 0;
  selectedComplaintId: number | null = null;
  selectedDepartment = '';

  performanceMetrics: PerformanceMetric[] = [];
  coordinationReason = '';
  coordSuccess = '';
  coordError = '';

  private readonly previousPeriodScore = 78;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.officerName = localStorage.getItem('name') ?? 'Officer';
    this.loadComplaints();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: 'Bearer ' + (localStorage.getItem('token') ?? '')
    });
  }

  loadComplaints(): void {
    this.http.get<Complaint[]>(
      'http://localhost:8080/api/officer/complaints',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.complaints = [...data].sort(
          (a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
        );

        this.total = data.length;
        this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
        this.resolved = data.filter(c => c.status === 'RESOLVED').length;

        this.commendations = 0;
        this.incidents = 0;


        this.loadPerformance();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 401) { this.router.navigate(['/login']); }
        this.cdr.detectChanges();
      }
    });
  }
  getMetricColor(value: number): string {
    if (value >= 90) return '#16a34a';
    if (value >= 75) return '#3b5bdb';
    if (value >= 60) return '#b45309';
    return '#dc2626';
  }

  updateStatus(complaintId: number, status: string): void {
    this.http.put(
      `http://localhost:8080/api/officer/update-status/${complaintId}?status=${status}`,
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => {
        const complaint = this.complaints.find(c => c.id === complaintId);
        if (complaint) {
          complaint.status = status as Complaint['status'];
          this.inProgress = this.complaints.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved = this.complaints.filter(c => c.status === 'RESOLVED').length;
          this.loadPerformance();
        }
        this.cdr.detectChanges();
      },
      error: (err) => { console.error('Update failed:', err); }
    });
  }

  loadPerformance(): void {
    const officerId = localStorage.getItem('userId');

    this.http.get<any>(
      `http://localhost:8080/api/complaints/officer-rating/${officerId}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (res) => {
        const score = res.performanceScore;

        this.performanceScore = score;
        this.scoreDashOffset = Math.round(314 * (1 - score / 100));

        // UI logic
        if (score >= 90) {
          this.scoreColor = '#16a34a';
          this.scoreStatus = 'Exemplary';
          this.scoreStatusClass = 'badge-exemplary';
        } else if (score >= 75) {
          this.scoreColor = '#3b5bdb';
          this.scoreStatus = 'Proficient';
          this.scoreStatusClass = 'badge-proficient';
        } else if (score >= 60) {
          this.scoreColor = '#b45309';
          this.scoreStatus = 'Developing';
          this.scoreStatusClass = 'badge-developing';
        } else {
          this.scoreColor = '#dc2626';
          this.scoreStatus = 'Needs Improvement';
          this.scoreStatusClass = 'badge-needs-improvement';
        }

        this.scoreTrend = +(score - this.previousPeriodScore).toFixed(1);

        // 🔥 OPTIONAL (show ratings in UI)
        console.log('Citizen Avg:', res.citizenAvg);
        console.log('DH Avg:', res.dhAvg);

        this.cdr.detectChanges();
      },
      error: () => console.error('Failed to load performance score')
    });
  }

  getSafeMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  openCoordination(id: number) {
    this.selectedComplaintId = id;
  }

  sendCoordination(complaintId: number) {
    const reason = this.coordinationReason.trim() || 'Need coordination support';

    this.http.post(
      `http://localhost:8080/api/officer/request-coordination/${complaintId}?department=${this.selectedDepartment}&reason=${encodeURIComponent(reason)}`,
      //                   ↑ change complaints to officer
      {},
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => {
        this.selectedComplaintId = null;
        this.selectedDepartment = '';
        this.coordinationReason = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Coordination error:', err);
      }
    });
  }
  private showError(msg: string) {
    this.coordError = msg;
    setTimeout(() => { this.coordError = ''; this.cdr.detectChanges(); }, 3000);
  }
  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}