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
  imageUrls?: string[];
  escalated?: boolean;
  rated?: boolean;
  rating?: number;
  resolutionImageUrl?: string;
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

    console.log('CitizenComponent: email =', email, 'token present =', !!token); // DEBUG

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
    const token = localStorage.getItem('token') ?? '';
    if (!token) {
      console.warn('No token found in localStorage'); // DEBUG
    }
    return new HttpHeaders({
      Authorization: 'Bearer ' + token
    });
  }

  loadMyComplaints(): void {
    const headers = this.getHeaders();

    console.log(
      'Calling /api/complaints/my',
      'URL:', 'http://localhost:8080/api/complaints/my',
      'Headers:', headers.keys().map(k => k + ': ' + headers.get(k))
    ); // DEBUG

    this.http.get<Complaint[]>(
      'http://localhost:8080/api/complaints/my',
      { headers }
    ).subscribe({
      next: (data) => {
        console.log('Received /my complaints:', data); // DEBUG
        this.complaints = data;
        this.total = data.length;
        this.open = data.filter(c => c.status === 'OPEN').length;
        this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
        this.resolved = data.filter(c => c.status === 'RESOLVED').length;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading my complaints:', err);

        if (err.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('email');
          this.router.navigate(['/login']);
        } else if (err.status === 403) {
          console.error(
            '403 Forbidden: You are authenticated but not allowed to access /api/complaints/my. ' +
            'Check backend role / scope / JWT filter.'
          );
        }
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
  if (imageUrl.startsWith('http')) {
    imageUrl = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
  }
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