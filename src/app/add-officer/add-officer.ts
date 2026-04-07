import { Component, Input,Output,EventEmitter , ChangeDetectorRef } from '@angular/core';
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
  @Output() officerAdded = new EventEmitter<void>();

  @Input() set lockedDepartment(val: string) {
    if (val) {
      this.department = val;
      this.isDepartmentLocked = true;
    }
  }

  @Input() apiUrl = 'http://localhost:8080/api/admin/add-officer';


  isDepartmentLocked = false;

  name         = '';
  email        = '';
  password     = '';
  department   = '';
  message      = '';
  isSuccess    = false;
  isSubmitting = false;

  readonly departments = [
    { value: 'WATER',       label: 'Water',       icon: '💧' },
    { value: 'ELECTRICITY', label: 'Electricity', icon: '⚡' },
    { value: 'SANITATION',  label: 'Sanitation',  icon: '🗑️' },
    { value: 'ROAD',        label: 'Road',        icon: '🛣️' }
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  addOfficer(): void {
    if (!this.name || !this.email || !this.password || !this.department) {
      this.isSuccess = false;
      this.message   = 'All fields are required.';
      return;
    }

    this.isSubmitting = true;
    this.message      = '';

    const headers = new HttpHeaders({
      Authorization: 'Bearer ' + (localStorage.getItem('token') ?? '')
    });

    this.http.post(
      this.apiUrl,
      { name: this.name, email: this.email, password: this.password, department: this.department },
      { headers, responseType: 'text' }
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.isSuccess    = true;
        this.message      = '✅ Officer added successfully!';
        this.name       = '';
        this.email      = '';
        this.password   = '';
        if (!this.isDepartmentLocked) this.department = '';
        this.officerAdded.emit();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.isSuccess    = false;
        this.message      = (err.error as string) || 'Failed to add officer.';
        this.cdr.detectChanges();
      }
    });
  }

  
}