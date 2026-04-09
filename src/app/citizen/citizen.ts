import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { WebSocketService } from '../services/websocket.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatbotComponent } from './chatbot/chatbot.component';


interface Complaint {
  id: number;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  department: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  deadline?: string;
  imageUrl?: string;
  escalated?: boolean;
  rated?: boolean;
  rating?: number;
  ratingComment?: string;
}

@Component({
  selector: 'app-citizen',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, ChatbotComponent],
  templateUrl: './citizen.html',
  styleUrls: ['./citizen.css']
})
export class CitizenComponent implements OnInit, OnDestroy {

  complaints: Complaint[] = [];
  total = 0;
  open = 0;
  inProgress = 0;
  resolved = 0;
  liveNotification = '';
  currentLang = localStorage.getItem('lang') ?? 'en';

  ratingMap: Record<number, number> = {};
  ratingCommentMap: Record<number, string> = {};
  ratingSuccess: Record<number, string> = {};
  ratingError: Record<number, string> = {};

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
    private readonly cdr: ChangeDetectorRef,
    private readonly wsService: WebSocketService,
    private readonly translate: TranslateService
  ) {
    this.translate.setDefaultLang('en');
    this.translate.use('en');
  }

  ngOnInit(): void {
    const savedLang = localStorage.getItem('lang') ?? 'en';
    this.currentLang = savedLang;
    this.translate.use(savedLang);
    const email = localStorage.getItem('email') ?? '';
    const token = localStorage.getItem('token') ?? '';

    this.wsService.connect(email, token);

    this.wsService.notification$.subscribe((message: string) => {
      this.liveNotification = message;
      this.loadMyComplaints();
      this.cdr.detectChanges();

      setTimeout(() => {
        this.liveNotification = '';
        this.cdr.detectChanges();
      }, 5000);
    });

    this.loadMyComplaints();
  }

  ngOnDestroy(): void {
    this.wsService.disconnect();
  }

  toggleLanguage(): void {
    this.currentLang = this.currentLang === 'en' ? 'ta' : 'en';
    this.translate.use(this.currentLang);
    localStorage.setItem('lang', this.currentLang);
    this.cdr.detectChanges();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: 'Bearer ' + (localStorage.getItem('token') ?? '')
    });
  }

  loadMyComplaints(): void {
    this.http.get<Complaint[]>(
      'http://localhost:8080/api/complaints/my',
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => {
        this.complaints = data;
        this.total = data.length;
        this.open = data.filter(c => c.status === 'OPEN').length;
        this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
        this.resolved = data.filter(c => c.status === 'RESOLVED').length;
        this.cdr.detectChanges();
      },
      error: (err) => {
        if (err.status === 401) { this.router.navigate(['/login']); }
        this.cdr.detectChanges();
      }
    });
  }

  setRating(complaintId: number, star: number): void {
    this.ratingMap[complaintId] = star;
  }

  submitRating(complaintId: number): void {
    const rating = this.ratingMap[complaintId];
    const ratingComment = this.ratingCommentMap[complaintId] ?? '';

    if (!rating) {
      this.ratingError[complaintId] = 'Please select a star rating.';
      setTimeout(() => { this.ratingError[complaintId] = ''; }, 3000);
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
        setTimeout(() => { this.ratingSuccess[complaintId] = ''; }, 3000);
      },
      error: (err) => {
        this.ratingError[complaintId] = (err.error as string) || 'Failed to submit rating.';
        setTimeout(() => { this.ratingError[complaintId] = ''; }, 3000);
      }
    });
  }

  getSafeMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  raiseComplaint(): void {
    this.router.navigate(['/create-complaint']);
  }

  getImageUrl(imageUrl: string | undefined): string {
    if (!imageUrl) return '';
    // Handle both cases: '/uploads/file.png' and 'uploads/file.png'
    const path = imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl;
    return 'http://localhost:8080' + path;
  }

  logout(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}