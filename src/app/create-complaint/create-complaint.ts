import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';

@Component({
  selector: 'app-create-complaint',
  standalone: true,
  imports: [FormsModule, CommonModule, SafeUrlPipe],
  templateUrl: './create-complaint.html',
  styleUrls: ['./create-complaint.css']
})
export class CreateComplaintComponent implements OnInit {

  title = '';
  description = '';
  department = '';
  priority = 'MEDIUM';

  latitude: number | null = null;
  longitude: number | null = null;
  locationStatus = '📡 Detecting your location...';
  locationReady = false;

  selectedFile: File | null = null;
  imagePreviewUrl: string | null = null;

  message = '';
  isSubmitting = false;
  currentStep = 1;

  priorities = [
    { value: 'LOW',       label: 'Low',       icon: '🟢', color: '#22c55e', bg: '#f0fdf4', border: '#86efac' },
    { value: 'MEDIUM',    label: 'Medium',    icon: '🟡', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
    { value: 'HIGH',      label: 'High',      icon: '🟠', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
    { value: 'EMERGENCY', label: 'Emergency', icon: '🔴', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
  ];

  departments = [
    { value: 'WATER',       label: 'Water',       icon: '💧' },
    { value: 'ELECTRICITY', label: 'Electricity', icon: '⚡' },
    { value: 'SANITATION',  label: 'Sanitation',  icon: '🗑️' },
    { value: 'ROAD',        label: 'Road',        icon: '🛣️' }
  ];

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          this.latitude = position.coords.latitude;
          this.longitude = position.coords.longitude;
          this.locationStatus = `📍 ${this.latitude.toFixed(5)}, ${this.longitude.toFixed(5)}`;
          this.locationReady = true;
        },
        () => {
          this.locationStatus = '⚠️ Location access denied. Please enable GPS.';
          this.locationReady = false;
        }
      );
    }
  }

  onFileSelect(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => { this.imagePreviewUrl = e.target.result; };
      reader.readAsDataURL(file);
    }
  }

  removeImage() {
    this.selectedFile = null;
    this.imagePreviewUrl = null;
  }

  setPriority(p: string) { this.priority = p; }
  setDepartment(d: string) { this.department = d; }

  nextStep() { if (this.currentStep < 3) this.currentStep++; }
  prevStep() { if (this.currentStep > 1) this.currentStep--; }

  get progressWidth() { return `${(this.currentStep / 3) * 100}%`; }

  get selectedPriority() {
    return this.priorities.find(p => p.value === this.priority);
  }

  get selectedDepartment() {
    return this.departments.find(d => d.value === this.department);
  }

  submitComplaint() {
    if (!this.title || !this.description || !this.department) {
      this.message = 'Please fill in all required fields.';
      return;
    }
    if (!this.latitude || !this.longitude) {
      this.message = 'Location not captured. Please allow GPS access.';
      return;
    }

    this.isSubmitting = true;
    this.message = '';

    const token = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    const complaintData = {
      title: this.title,
      description: this.description,
      department: this.department,
      priority: this.priority,
      latitude: this.latitude,
      longitude: this.longitude,
      imageUrl: this.selectedFile ? this.selectedFile.name : null
    };

    this.http.post('http://localhost:8080/api/complaints/create', complaintData, { headers })
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.router.navigate(['/citizen']);
        },
        error: (err) => {
          this.isSubmitting = false;
          this.message = err.error?.message || 'Failed to submit. Please try again.';
        }
      });
  }

  goBack() { this.router.navigate(['/citizen']); }
}