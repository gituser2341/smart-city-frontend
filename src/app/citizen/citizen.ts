import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { WebSocketService } from '../services/websocket.service';

@Component({
  selector: 'app-citizen',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './citizen.html',
  styleUrls: ['./citizen.css']
})
export class CitizenComponent implements OnInit {

  complaints: any[] = [];
  total = 0;
  open = 0;
  inProgress = 0;
  resolved = 0;
  liveNotification = ''

  // ✅ Rating maps
  ratingMap: { [key: number]: number } = {};
  ratingCommentMap: { [key: number]: string } = {};
  ratingSuccess: { [key: number]: string } = {};
  ratingError: { [key: number]: string } = {};

  constructor(
    private http: HttpClient,
    private router: Router,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    const email = localStorage.getItem('email') || '';
  const token = localStorage.getItem('token') || '';
    

  // ⚡ Connect WebSocket
  this.wsService.connect(email, token);

  // 🔔 Listen for live notifications
  this.wsService.notification$.subscribe(message => {
    this.liveNotification = message;  // ← show banner instantly
    this.loadMyComplaints();          // ← refresh complaint list
    this.cdr.detectChanges();

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.liveNotification = '';
      this.cdr.detectChanges();
    }, 5000);
  });
    this.loadMyComplaints();
  }

  getHeaders() {
    return new HttpHeaders({
      Authorization: 'Bearer ' + localStorage.getItem('token')
    });
  }

  loadMyComplaints() {
    this.http.get<any[]>('http://localhost:8080/api/complaints/my',
      { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.complaints = data;
          this.total      = data.length;
          this.open       = data.filter(c => c.status === 'OPEN').length;
          this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved   = data.filter(c => c.status === 'RESOLVED').length;
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err.status === 401) this.router.navigate(['/login']);
          this.cdr.detectChanges();
        }
      });
  }

  // ✅ Set star rating
  setRating(complaintId: number, star: number) {
    this.ratingMap[complaintId] = star;
  }

  // ✅ Submit rating
  submitRating(complaintId: number) {
    const rating = this.ratingMap[complaintId];
    const ratingComment = this.ratingCommentMap[complaintId] || '';

    if (!rating) {
      this.ratingError[complaintId] = 'Please select a star rating.';
      setTimeout(() => this.ratingError[complaintId] = '', 3000);
      return;
    }

    this.http.put(
      `http://localhost:8080/api/complaints/rate/${complaintId}`,
      { rating, ratingComment },
      { headers: this.getHeaders(), responseType: 'text' }
    ).subscribe({
      next: () => {
        this.ratingSuccess[complaintId] = '⭐ Rating submitted successfully!';
        this.ratingError[complaintId] = '';
        this.loadMyComplaints();
        setTimeout(() => this.ratingSuccess[complaintId] = '', 3000);
      },
      error: (err) => {
        this.ratingError[complaintId] = err.error || 'Failed to submit rating.';
        setTimeout(() => this.ratingError[complaintId] = '', 3000);
      }
    });
  }

  getSafeMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  raiseComplaint() { this.router.navigate(['/create-complaint']); }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
  ngOnDestroy() {
  this.wsService.disconnect();
}
}