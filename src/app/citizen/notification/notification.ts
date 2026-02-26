import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.html',
  styleUrls: ['./notification.css']
})
export class NotificationComponent implements OnInit {

  private http = inject(HttpClient);
  private router = inject(Router);

  notifications: any[] = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    let role = localStorage.getItem('role') || '';
    const token = localStorage.getItem('token');

    if (!token || !role) {
      this.router.navigate(['/login']);
      return;
    }

    if (role.startsWith('ROLE_')) {
      role = role.replace('ROLE_', '');
    }

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get<any[]>(`http://localhost:8080/api/notifications/${role}`, { headers })
      .subscribe({
        next: (data) => {
          this.notifications = data.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          this.isLoading = false;
        },
        error: (err) => {
          this.errorMessage = 'Failed to load notifications.';
          this.isLoading = false;
          if (err.status === 401) this.router.navigate(['/login']);
        }
      });
  }

  goBack() {
    const role = localStorage.getItem('role');
    if (role === 'CITIZEN') this.router.navigate(['/citizen']);
    else if (role === 'OFFICER') this.router.navigate(['/officer']);
    else this.router.navigate(['/admin']);
  }

  getIcon(message: string): string {
    if (message?.toLowerCase().includes('resolved')) return '✅';
    if (message?.toLowerCase().includes('progress')) return '⚙️';
    if (message?.toLowerCase().includes('assigned')) return '👮';
    return '🔔';
  }
}