import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AddOfficerComponent } from '../add-officer/add-officer';

@Component({
  standalone: true,
  imports: [FormsModule, CommonModule, AddOfficerComponent],
  selector: 'app-department-head',
  templateUrl: './department-head.component.html',
  styleUrls: ['./department-head.component.css']
})
export class DepartmentHeadComponent implements OnInit {

  complaints = signal<any[]>([]);
  escalated = signal<any[]>([]);
  officers = signal<any[]>([]);
  successMessage = signal('');
  errorMessage = signal('');

  dhDepartment = '';
  dhName = '';
  activeTab = 'dashboard';

  // ✅ Track by complaintId (not officerId) — one rating per complaint
  submittedRatingComplaintIds = new Set<number>();

  selectedOfficerMap: { [complaintId: number]: number } = {};
  selectedPriorityMap: { [complaintId: number]: string } = {};
  dhRatingMap: { [officerId: number]: number } = {};
  dhFeedbackMap: { [officerId: number]: string } = {};
  dhRatingComplaintMap: { [officerId: number]: number } = {};

  reassignMessage = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    const token = localStorage.getItem('token');
    if (!token) { this.router.navigate(['/login']); return; }
    const payload = JSON.parse(atob(token.split('.')[1]));
    this.dhDepartment = payload.department ?? '';
    this.dhName = payload.name ?? 'Department Head';
    this.loadAll();
  }

  private loadAll() {
    this.loadComplaints();
    this.loadOfficers();
    this.loadEscalated();
  }

  private getHeaders() {
    const token = localStorage.getItem('token');
    if (!token) { this.router.navigate(['/login']); }

    try {
      const payload = JSON.parse(atob(token!.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) {
        localStorage.clear();
        this.router.navigate(['/login']);
      }
    } catch {
      localStorage.clear();
      this.router.navigate(['/login']);
    }

    return new HttpHeaders({ Authorization: `Bearer ${token ?? ''}` });
  }

  private showSuccess(msg: string) {
    this.successMessage.set(msg);
    setTimeout(() => this.successMessage.set(''), 3000);
  }

  private showError(msg: string) {
    this.errorMessage.set(msg);
    setTimeout(() => this.errorMessage.set(''), 3000);
  }

  setTab(tab: string) {
    this.activeTab = tab;
    this.reassignMessage = '';
  }

  loadComplaints() {
    this.http.get<any[]>(
      'http://localhost:8080/api/dh/complaints',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.complaints.set(data ?? []);
        // ✅ Pre-populate already-rated complaints from backend data
        (data ?? []).forEach(c => {
          if (c.dhRated) {
            this.submittedRatingComplaintIds.add(c.id);
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err.status === 401) this.router.navigate(['/login']);
        else this.showError('Failed to load complaints');
      }
    });
  }

  loadEscalated() {
    this.http.get<any[]>(
      'http://localhost:8080/api/dh/escalated',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.escalated.set(data ?? []); this.cdr.detectChanges(); },
      error: () => this.showError('Failed to load escalated complaints')
    });
  }

  loadOfficers() {
    this.http.get<any[]>(
      'http://localhost:8080/api/dh/officers',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.officers.set(data ?? []);
        this.officers().forEach(o => this.loadOfficerRatings(o.id));
        this.cdr.detectChanges();
      },
      error: () => this.showError('Failed to load officers')
    });
  }

  reassign(complaintId: number) {
    const officerId = this.selectedOfficerMap[complaintId];
    if (!officerId) { this.showError('Please select an officer first'); return; }

    const complaint = this.complaints().find(c => c.id === complaintId)
      ?? this.escalated().find(c => c.id === complaintId);

    if (complaint?.status === 'RESOLVED') {
      this.showError('Cannot reassign a resolved complaint.');
      return;
    }
    if (complaint?.status === 'OPEN') {
      this.showError('This complaint has not been assigned yet. Please assign an officer first.');
      return;
    }

    this.http.put(
      `http://localhost:8080/api/dh/reassign/${complaintId}?officerId=${officerId}`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.reassignMessage = `✅ Complaint #${complaintId} has been reassigned successfully!`;
        setTimeout(() => { this.reassignMessage = ''; this.cdr.detectChanges(); }, 3000);
        this.loadComplaints();
        this.loadEscalated();
        this.cdr.detectChanges();
      },
      error: () => this.showError('Failed to reassign complaint')
    });
  }

  assignNewOfficer(complaintId: number) {
    const officerId = this.selectedOfficerMap[complaintId];
    if (!officerId) { this.showError('Please select an officer first'); return; }

    const complaint = this.complaints().find(c => c.id === complaintId);
    if (complaint?.status !== 'OPEN') {
      this.showError('This complaint is already assigned. Use Reassign instead.');
      return;
    }

    this.http.put(
      `http://localhost:8080/api/dh/reassign/${complaintId}?officerId=${officerId}`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.reassignMessage = `✅ Complaint #${complaintId} has been assigned successfully!`;
        setTimeout(() => { this.reassignMessage = ''; this.cdr.detectChanges(); }, 3000);
        this.loadComplaints();
        this.cdr.detectChanges();
      },
      error: () => this.showError('Failed to assign complaint')
    });
  }

  get totalOpen() { return this.complaints().filter(c => c.status === 'OPEN').length; }
  get totalInProgress() { return this.complaints().filter(c => c.status === 'IN_PROGRESS').length; }
  get totalResolved() { return this.complaints().filter(c => c.status === 'RESOLVED').length; }
  get totalEscalated() { return this.escalated().length; }

  getTimeRemaining(deadline: string | undefined): string {
    if (!deadline) return '';
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff < 0) return `${Math.abs(Math.floor(diff / 3_600_000))}h overdue`;
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  }

  updatePriority(complaintId: number, priority: string) {
    if (!priority) return;
    this.http.put(
      `http://localhost:8080/api/dh/complaints/${complaintId}/priority?priority=${priority}`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { this.showSuccess('Priority updated'); this.loadEscalated(); },
      error: () => this.showError('Failed to update priority')
    });
  }

  logout() { localStorage.clear(); this.router.navigate(['/login']); }

  getResolvedByOfficer(officerId: number): any[] {
  return this.complaints().filter(
    c => c.status === 'RESOLVED'
      && c.assignedOfficer?.id === officerId
      && !this.submittedRatingComplaintIds.has(c.id)
      && !c.dhRated   // ← also exclude backend-flagged rated complaints
  );
}

  // ✅ Check if a specific complaint has already been DH-rated
  isComplaintRated(complaintId: number): boolean {
    return this.submittedRatingComplaintIds.has(complaintId);
  }

  // ✅ Check if ALL resolved complaints for an officer are already rated
  allComplaintsRated(officerId: number): boolean {
    const resolved = this.getResolvedByOfficer(officerId);
    return resolved.length > 0 && resolved.every(c => this.isComplaintRated(c.id));
  }

  submitDhRating(officerId: number) {
    const complaintId = this.dhRatingComplaintMap[officerId];
    const rating = this.dhRatingMap[officerId];
    const feedback = this.dhFeedbackMap[officerId] ?? '';

    if (!complaintId) { this.showError('Select a complaint to rate'); return; }
    if (!rating) { this.showError('Select a star rating'); return; }

    // ✅ Guard: prevent re-submitting an already rated complaint
    if (this.submittedRatingComplaintIds.has(complaintId)) {
      this.showError('This complaint has already been rated');
      return;
    }

    this.http.post(
      `http://localhost:8080/api/dh/complaints/${complaintId}/rate?rating=${rating}&feedback=${encodeURIComponent(feedback)}`,
      {},
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.showSuccess('Rating submitted successfully');
        this.submittedRatingComplaintIds.add(complaintId); // ✅ track by complaintId
        this.dhRatingMap[officerId] = 0;
        this.dhFeedbackMap[officerId] = '';
        this.dhRatingComplaintMap[officerId] = 0;
        this.loadOfficers();
        this.loadComplaints();
        this.cdr.detectChanges();
      },
      error: (err) => {
        const msg = typeof err.error === 'string'
          ? err.error
          : err.error?.message ?? 'Failed to submit rating';
        this.showError(msg);
      }
    });
  }

  loadOfficerRatings(officerId: number) {
    this.http.get<any>(
      `http://localhost:8080/api/complaints/officer-rating/${officerId}`,
      { headers: this.getHeaders() }
    ).subscribe(res => {
      const officer = this.officers().find(o => o.id === officerId);
      if (officer) {
        officer.dhAvg = res.dhAvg;
        officer.citizenAvg = res.citizenAvg;
        officer.performanceScore = res.performanceScore;
        this.cdr.detectChanges();
      }
    });
  }

  getImageUrl(imageUrl: string | undefined): string {
    if (!imageUrl) return '';
    // ✅ Always build from base — filename only stored in DB
    return 'http://localhost:8080/uploads/' + imageUrl;
  }

  onOfficerAdded() {
    this.loadOfficers();
    this.cdr.detectChanges();
  }
}