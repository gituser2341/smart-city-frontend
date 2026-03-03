import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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

  // ── Complaints ──────────────────────────────────
  complaints: any[] = [];
  officerName = '';
  total       = 0;
  inProgress  = 0;
  resolved    = 0;
  isLoading   = true;

  // ── Performance Score ───────────────────────────
  performanceScore  = 0;
  scoreDashOffset   = 314;
  scoreColor        = '#1565c0';
  scoreStatus       = '';
  scoreStatusClass  = '';
  scoreTrend        = 0;
  commendations     = 0;
  incidents         = 0;
  resolutionRate    = 0;

  performanceMetrics: { label: string; value: number }[] = [];

  private previousPeriodScore = 78; // replace with real API value for accurate trend

  constructor(
    private http: HttpClient,
    private router: Router,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.officerName = localStorage.getItem('name') || 'Officer';
    this.loadComplaints();
  }

  loadComplaints() {
    const token   = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get<any[]>('http://localhost:8080/api/officer/complaints', { headers })
      .subscribe({
        next: (data) => {
          this.complaints = data.sort((a, b) => {
            const order: any = { EMERGENCY: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            return order[a.priority] - order[b.priority];
          });

          this.total      = data.length;
          this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved   = data.filter(c => c.status === 'RESOLVED').length;

          // Replace with real API fields when backend exposes them:
          // this.commendations = data.commendations ?? 0;
          // this.incidents     = data.incidents ?? 0;
          this.commendations = 0;
          this.incidents     = 0;

          this.computePerformance();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isLoading = false;
          if (err.status === 401) this.router.navigate(['/login']);
          this.cdr.detectChanges();
        }
      });
  }

  computePerformance() {
    const resolutionScore = this.total > 0
      ? Math.round((this.resolved / this.total) * 100)
      : 0;
    this.resolutionRate = resolutionScore;

    const responseScore   = Math.min(100, Math.max(0, 100 - this.incidents * 8));
    const commendScore    = Math.min(100, this.commendations * 10);
    const loadScore       = Math.max(0, 100 - this.inProgress * 5);
    const complianceScore = Math.min(100, 85 + this.commendations * 2);
    const communityScore  = Math.max(0, 80 - this.incidents * 5);

    this.performanceScore = Math.round(
      resolutionScore * 0.35 +
      responseScore   * 0.20 +
      commendScore    * 0.15 +
      loadScore       * 0.15 +
      complianceScore * 0.10 +
      communityScore  * 0.05
    );

    // SVG ring: dasharray=314, offset drives how much arc is visible
    this.scoreDashOffset = Math.round(314 * (1 - this.performanceScore / 100));

    if (this.performanceScore >= 90) {
      this.scoreColor       = '#16a34a';
      this.scoreStatus      = 'Exemplary';
      this.scoreStatusClass = 'badge-exemplary';
    } else if (this.performanceScore >= 75) {
      this.scoreColor       = '#1565c0';
      this.scoreStatus      = 'Proficient';
      this.scoreStatusClass = 'badge-proficient';
    } else if (this.performanceScore >= 60) {
      this.scoreColor       = '#d97706';
      this.scoreStatus      = 'Developing';
      this.scoreStatusClass = 'badge-developing';
    } else {
      this.scoreColor       = '#dc2626';
      this.scoreStatus      = 'Needs Improvement';
      this.scoreStatusClass = 'badge-needs-improvement';
    }

    this.scoreTrend = +(this.performanceScore - this.previousPeriodScore).toFixed(1);

    this.performanceMetrics = [
      { label: 'Resolution Rate',    value: resolutionScore  },
      { label: 'Response Quality',   value: responseScore    },
      { label: 'Commendations',      value: commendScore     },
      { label: 'Case Load Balance',  value: loadScore        },
      { label: 'Compliance',         value: complianceScore  },
      { label: 'Community Feedback', value: communityScore   },
    ];
  }

  getMetricColor(value: number): string {
    if (value >= 90) return '#16a34a';
    if (value >= 75) return '#1565c0';
    if (value >= 60) return '#d97706';
    return '#dc2626';
  }

  updateStatus(complaintId: number, status: string) {
    const token   = localStorage.getItem('token');
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
          this.inProgress  = this.complaints.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved    = this.complaints.filter(c => c.status === 'RESOLVED').length;
          this.computePerformance(); // live re-score on every status change
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Update failed:', err)
    });
  }

  getSafeMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}