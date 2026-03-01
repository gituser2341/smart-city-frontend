import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-add-officer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-officer.html',
  styleUrls: ['./add-officer.css']
})
export class AddOfficerComponent {

  name = '';
  email = '';
  password = '';
  department = '';
  message = '';
  isSubmitting = false;

  departments = [
    { value: 'WATER',       label: 'Water',       icon: '💧' },
    { value: 'ELECTRICITY', label: 'Electricity', icon: '⚡' },
    { value: 'SANITATION',  label: 'Sanitation',  icon: '🗑️' },
    { value: 'ROAD',        label: 'Road',        icon: '🛣️' }
  ];

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef  // ← ADD
  ) {}

  addOfficer() {
    if (!this.name || !this.email || !this.password || !this.department) {
      this.message = 'All fields are required.';
      return;
    }

    this.isSubmitting = true;
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    const officerData = {
      name: this.name,
      email: this.email,
      password: this.password,
      department: this.department
    };

    this.http.post('http://localhost:8080/api/admin/add-officer', officerData,
      { headers, responseType: 'text' })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.message = '✅ Officer added successfully!';
          this.name = '';
          this.email = '';
          this.password = '';
          this.department = '';
          this.cdr.detectChanges();  // ← ADD
        },
        error: (err) => {
          this.isSubmitting = false;
          this.message = err.error || 'Failed to add officer.';
          this.cdr.detectChanges();  // ← ADD
        }
      });
  }

  goBack() { this.router.navigate(['/admin']); }
}