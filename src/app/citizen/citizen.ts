import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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

  constructor(
    private http: HttpClient,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

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
          if (err.status === 401) this.router.navigate(['/login']);
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
}