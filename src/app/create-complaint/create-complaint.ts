import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

export interface MediaFile {
  file: File;
  previewUrl: string;
  isVideo: boolean;
  name: string;
  sizeMB: string;
}

interface Department {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-create-complaint',
  standalone: true,
  imports: [FormsModule, CommonModule, TranslateModule],
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

  mediaFiles: MediaFile[] = [];
  uploadError = '';
  message = '';
  isSubmitting = false;
  currentStep = 1;

  readonly IMAGE_MAX_SIZE_MB = 10;
  readonly IMAGE_MIN_WIDTH = 640;
  readonly IMAGE_MIN_HEIGHT = 480;

  readonly VIDEO_MAX_SIZE_MB = 200;
  readonly VIDEO_MAX_DURATION = 30;
  readonly VIDEO_MIN_WIDTH = 640;
  readonly VIDEO_MIN_HEIGHT = 480;
  readonly VIDEO_MAX_WIDTH = 1920;
  readonly VIDEO_MAX_HEIGHT = 1080;

  readonly MAX_FILES = 3;

  readonly departments: Department[] = [
    { value: 'WATER', label: 'Water', icon: '💧' },
    { value: 'ELECTRICITY', label: 'Electricity', icon: '⚡' },
    { value: 'SANITATION', label: 'Sanitation', icon: '🗑️' },
    { value: 'ROAD', label: 'Road', icon: '🛣️' }
  ];

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
    private readonly translate: TranslateService
  ) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('lang') ?? 'en';
    this.translate.use(savedLang);
  }

  ngOnInit(): void {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
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

  get remainingSlots(): number { return this.MAX_FILES - this.mediaFiles.length; }
  get canAddMore(): boolean { return this.mediaFiles.length < this.MAX_FILES; }
  get progressWidth(): string { return `${(this.currentStep / 3) * 100}%`; }

  /* Generates a SafeResourceUrl for the map iframe — replaces the unsafe pipe */
  getMapUrl(lat: number, lng: number): SafeResourceUrl {
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) { return; }

    this.uploadError = '';

    if (this.mediaFiles.length >= this.MAX_FILES) {
      this.uploadError = `Maximum ${this.MAX_FILES} files allowed per complaint.`;
      input.value = '';
      return;
    }

    const incoming = Array.from(files).slice(0, this.remainingSlots);
    const skipped = files.length - incoming.length;

    for (const file of incoming) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        this.uploadError = `"${file.name}" is not supported. Use JPG/PNG for images or MP4/MOV/3GP for videos.`;
        continue;
      }

      if (isImage) { this.validateImage(file); }
      else { this.validateVideo(file); }
    }

    if (skipped > 0) {
      this.uploadError = `Only ${this.MAX_FILES} files allowed. ${skipped} file(s) were skipped.`;
    }

    input.value = '';
  }

  private validateImage(file: File): void {
    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.uploadError = `"${file.name}": Only JPG and PNG images are allowed.`;
      return;
    }

    const maxBytes = this.IMAGE_MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.uploadError = `"${file.name}" exceeds ${this.IMAGE_MAX_SIZE_MB}MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width < this.IMAGE_MIN_WIDTH || img.height < this.IMAGE_MIN_HEIGHT) {
        this.uploadError = `"${file.name}" must be at least ${this.IMAGE_MIN_WIDTH}×${this.IMAGE_MIN_HEIGHT}px. Got ${img.width}×${img.height}px.`;
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.mediaFiles.push({
          file, isVideo: false, name: file.name,
          previewUrl: (e.target as FileReader).result as string,
          sizeMB: (file.size / 1024 / 1024).toFixed(1)
        });
      };
      reader.readAsDataURL(file);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.uploadError = `Could not read "${file.name}". Please try another file.`;
    };

    img.src = objectUrl;
  }

  private validateVideo(file: File): void {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/3gpp'];
    if (!allowedTypes.includes(file.type)) {
      this.uploadError = `"${file.name}": Only MP4, MOV, and 3GP videos are allowed.`;
      return;
    }

    const maxBytes = this.VIDEO_MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.uploadError = `"${file.name}" exceeds ${this.VIDEO_MAX_SIZE_MB}MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
      return;
    }

    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const d = video.duration;

      if (d > this.VIDEO_MAX_DURATION) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" is ${Math.round(d)}s long. Maximum is ${this.VIDEO_MAX_DURATION}s.`;
        return;
      }

      if (w < this.VIDEO_MIN_WIDTH || h < this.VIDEO_MIN_HEIGHT) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" resolution ${w}×${h}px is too low. Minimum is ${this.VIDEO_MIN_WIDTH}×${this.VIDEO_MIN_HEIGHT}px.`;
        return;
      }

      if (w > this.VIDEO_MAX_WIDTH || h > this.VIDEO_MAX_HEIGHT) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" resolution ${w}×${h}px is too high. Maximum is ${this.VIDEO_MAX_WIDTH}×${this.VIDEO_MAX_HEIGHT}px (Full HD).`;
        return;
      }

      this.mediaFiles.push({
        file, isVideo: true, name: file.name,
        previewUrl: objectUrl,
        sizeMB: (file.size / 1024 / 1024).toFixed(1)
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.uploadError = `Could not read "${file.name}". Please try another file.`;
    };

    video.src = objectUrl;
  }

  removeMedia(index: number): void {
    const removed = this.mediaFiles[index];
    if (removed.isVideo) { URL.revokeObjectURL(removed.previewUrl); }
    this.mediaFiles.splice(index, 1);
    this.uploadError = '';
  }

  setDepartment(d: string): void { this.department = d; }
  nextStep(): void { if (this.currentStep < 3) { this.currentStep++; } }
  prevStep(): void { if (this.currentStep > 1) { this.currentStep--; } }

  submitComplaint(): void {
    // in submitComplaint()
    if (!this.title || !this.description || !this.department) {
      this.message = this.translate.instant('createComplaint.required');
      return;
    }
    if (!this.latitude || !this.longitude) {
      this.message = this.translate.instant('createComplaint.noLocation');
      return;
    }

    this.isSubmitting = true;
    this.message = '';

    const headers = new HttpHeaders({
      Authorization: 'Bearer ' + (localStorage.getItem('token') ?? '')
    });

    if (this.mediaFiles.length > 0) {
      this.uploadFilesSequentially(0, [], headers);
    } else {
      this.submitWithMedia([], headers);
    }
  }

  private uploadFilesSequentially(index: number, uploadedUrls: string[], headers: HttpHeaders): void {
    if (index >= this.mediaFiles.length) {
      this.submitWithMedia(uploadedUrls, headers);
      return;
    }

    const formData = new FormData();
    formData.append('file', this.mediaFiles[index].file);

    this.http.post<string>('http://localhost:8080/api/upload', formData, { responseType: 'text' as 'json' })
      .subscribe({
        next: (url) => {
          uploadedUrls.push(url);
          this.uploadFilesSequentially(index + 1, uploadedUrls, headers);
        },
        error: () => {
          this.message = `Failed to upload "${this.mediaFiles[index].name}". Please try again.`;
          this.isSubmitting = false;
        }
      });
  }

  private submitWithMedia(imageUrls: string[], headers: HttpHeaders): void {
    this.http.post(
      'http://localhost:8080/api/complaints/create',
      {
        title: this.title,
        description: this.description,
        department: this.department,
        priority: this.priority,
        latitude: this.latitude,
        longitude: this.longitude,
        imageUrls
      },
      { headers }
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigate(['/citizen']);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.message = (err.error as { message?: string })?.message ?? 'Failed to submit. Please try again.';
      }
    });
  }

  goBack(): void { this.router.navigate(['/citizen']); }
}