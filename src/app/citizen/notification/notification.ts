import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface Notification {
  id: number;
  message: string;
  createdAt: string;
}

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule,TranslateModule],
  templateUrl: './notification.html',
  styleUrls: ['./notification.css']
})
export class NotificationComponent implements OnInit {

  notifications: Notification[] = [];
  isLoading    = true;
  errorMessage = '';

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly translate: TranslateService
  ) {
    this.translate.setDefaultLang('en');
    this.translate.use(localStorage.getItem('lang') ?? 'en'); 
  }

  ngOnInit(): void {
    this.isLoading    = true;
    this.notifications = [];
    this.errorMessage  = '';

    let role        = localStorage.getItem('role') ?? '';
    const token     = localStorage.getItem('token');

    if (!token || !role) {
      this.router.navigate(['/login']);
      return;
    }

    if (role.startsWith('ROLE_')) {
      role = role.replace('ROLE_', '');
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http.get<Notification[]>(
      `http://localhost:8080/api/notifications/my`,
      { headers }
    ).subscribe({
      next: (data) => {
        this.notifications = [...data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMessage = 'Failed to load notifications.';
        this.isLoading    = false;
        if (err.status === 401) { this.router.navigate(['/login']); }
        this.cdr.detectChanges();
      }
    });
  }

  goBack(): void {
    const role = localStorage.getItem('role');
    if (role === 'CITIZEN')      { this.router.navigate(['/citizen']); }
    else if (role === 'OFFICER') { this.router.navigate(['/officer']); }
    else                         { this.router.navigate(['/admin']);   }
  }

  getIcon(message: string): string {
    const lower = message?.toLowerCase() ?? '';
    if (lower.includes('resolved')) { return '✅'; }
    if (lower.includes('progress')) { return '⚙️'; }
    if (lower.includes('assigned')) { return '👮'; }
    return '🔔';
  }
}