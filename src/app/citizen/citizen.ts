import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';



@Component({
  selector: 'app-citizen',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './citizen.html',
  styleUrls: ['./citizen.css']
})
export class CitizenComponent implements OnInit {

  complaints: any[] = [];

  total = 0;
  open = 0;
  inProgress = 0;
  resolved = 0;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    // ✅ Uses JWT to identify user, no userId needed
    this.http.get<any[]>('http://localhost:8080/api/complaints/my', { headers })
      .subscribe({
        next: (data) => {
          this.complaints = data;
          this.total = data.length;
          this.open = data.filter(c => c.status === 'OPEN').length;
          this.inProgress = data.filter(c => c.status === 'IN_PROGRESS').length;
          this.resolved = data.filter(c => c.status === 'RESOLVED').length;
        },
        error: (err) => {
          console.error('Failed to load complaints:', err);
          if (err.status === 401) {
            this.router.navigate(['/login']); // ✅ redirect if token expired
          }
        }
      });
  }

  raiseComplaint() {
    this.router.navigate(['/create-complaint']);
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}