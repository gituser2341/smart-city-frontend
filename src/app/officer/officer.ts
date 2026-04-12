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
  resolutionImageUrl?: string;
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

  resolutionImageMap: Record<number, File | null> = {};
  resolutionPreviewMap: Record<number, string> = {};
  resolutionUploadError: Record<number, string> = {};
  isUpdatingStatus: Record<number, boolean> = {};

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

  onResolutionImageSelect(event: Event, complaintId: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      this.resolutionUploadError[complaintId] = 'Only JPG and PNG allowed.';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.resolutionUploadError[complaintId] = 'Image must be under 10MB.';
      return;
    }

    this.resolutionImageMap[complaintId] = file;
    this.resolutionUploadError[complaintId] = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      this.resolutionPreviewMap[complaintId] = (e.target as FileReader).result as string;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  updateStatus(complaintId: number, status: string): void {
    this.isUpdatingStatus[complaintId] = true;

    if (status === 'RESOLVED' && this.resolutionImageMap[complaintId]) {
      const formData = new FormData();
      formData.append('file', this.resolutionImageMap[complaintId]!);

      this.http.post<string>(
        'http://localhost:8080/api/upload',
        formData,
        { responseType: 'text' as 'json' }
      ).subscribe({
        next: (filename) => {
          this.submitStatusUpdate(complaintId, status, filename);
        },
        error: () => {
          this.isUpdatingStatus[complaintId] = false;
          alert('Failed to upload resolution image.');
          this.cdr.detectChanges();
        }
      });
    } else {
      this.submitStatusUpdate(complaintId, status, null);
    }
  }

  private submitStatusUpdate(complaintId: number, status: string, resolutionImageUrl: string | null): void {
    let url = `http://localhost:8080/api/officer/update-status/${complaintId}?status=${status}`;
    if (resolutionImageUrl) {
      url += `&resolutionImageUrl=${encodeURIComponent(resolutionImageUrl)}`;
    }

    this.http.put(url, {}, { headers: this.getHeaders(), responseType: 'text' as 'json' })
      .subscribe({
        next: () => {
          this.isUpdatingStatus[complaintId] = false;
          this.resolutionImageMap[complaintId] = null;
          this.resolutionPreviewMap[complaintId] = '';
          this.loadComplaints();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isUpdatingStatus[complaintId] = false;
          console.error('Update failed:', err);
          this.cdr.detectChanges();
        }
      });
  }

  loadPerformance(): void {
    const officerId = localStorage.getItem('userId');

    this.http.get<any>(
      `http://localhost:8080/api/complaints/officer-rating/${officerId}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (res) => {
        const score = res.performanceScore ?? 0;

        this.performanceScore = score;
        this.scoreDashOffset = Math.round(314 * (1 - score / 100));
        this.resolutionRate = this.total > 0
          ? Math.round((this.resolved / this.total) * 100) : 0;

        // ── Score status ──────────────────────────────
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

        // ── Real values from backend matching PerformanceService formula ──
        const citizenAvg = res.citizenAvg ?? 0;  // 0–5 stars
        const dhAvg = res.dhAvg ?? 0;  // 0–5 stars
        const totalCases = res.total ?? this.total;
        const resolvedCases = res.resolved ?? this.resolved;
        const escalatedCases = res.escalated ?? 0;
        const onTimeResolved = res.onTimeResolved ?? 0;

        // Mirror exact weights from PerformanceService
        const resolutionRate = totalCases > 0 ? Math.round((resolvedCases / totalCases) * 100) : 0;
        const escalationFreeRate = totalCases > 0 ? Math.round(100 - (escalatedCases / totalCases) * 100) : 100;
        const slaScore = totalCases > 0 ? Math.round((onTimeResolved / totalCases) * 100) : 0;
        const citizenScore = Math.round((citizenAvg / 5) * 100);
        const dhScore = Math.round((dhAvg / 5) * 100);

        this.performanceMetrics = [
          {
            label: '✅ Resolution Rate',
            value: resolutionRate          // weight 25%
          },
          {
            label: '🚨 Escalation-Free Rate',
            value: escalationFreeRate      // weight 20%
          },
          {
            label: '⏱️ SLA Compliance',
            value: slaScore                // weight 20%
          },
          {
            label: '🏢 Dept. Head Rating',
            value: dhScore                 // weight 20%
          },
          {
            label: '⭐ Citizen Satisfaction',
            value: citizenScore            // weight 15%
          }
        ];

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


  getImageUrl(imageUrl: string | undefined): string {
    if (!imageUrl) return '';
    return 'http://localhost:8080/uploads/' + imageUrl;
  }

  openImage(url: string): void {
    window.open(url, '_blank');
  }

  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}