import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';

export interface MediaFile {
  file: File;
  previewUrl: string;
  isVideo: boolean;
  name: string;
  sizeMB: string;
}

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

  mediaFiles: MediaFile[] = [];
  uploadError = '';
  message = '';
  isSubmitting = false;
  currentStep = 1;

  // ── Image Limits ───────────────────────────────
  readonly IMAGE_MAX_SIZE_MB  = 10;
  readonly IMAGE_MIN_WIDTH    = 640;
  readonly IMAGE_MIN_HEIGHT   = 480;

  // ── Video Limits ───────────────────────────────
  readonly VIDEO_MAX_SIZE_MB  = 200;
  readonly VIDEO_MAX_DURATION = 30;        // seconds
  readonly VIDEO_MIN_WIDTH    = 640;
  readonly VIDEO_MIN_HEIGHT   = 480;
  readonly VIDEO_MAX_WIDTH    = 1920;
  readonly VIDEO_MAX_HEIGHT   = 1080;

  // ── General ────────────────────────────────────
  readonly MAX_FILES = 3;

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
          this.latitude  = position.coords.latitude;
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
  get canAddMore(): boolean    { return this.mediaFiles.length < this.MAX_FILES; }

  // ── File Selection Entry Point ─────────────────
  onFileSelect(event: any) {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    this.uploadError = '';

    if (this.mediaFiles.length >= this.MAX_FILES) {
      this.uploadError = `Maximum ${this.MAX_FILES} files allowed per complaint.`;
      event.target.value = '';
      return;
    }

    const incoming = Array.from(files).slice(0, this.remainingSlots);
    const skipped  = files.length - incoming.length;

    for (const file of incoming) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        this.uploadError = `"${file.name}" is not supported. Use JPG/PNG for images or MP4/MOV/3GP for videos.`;
        continue;
      }

      if (isImage) this.validateImage(file);
      else         this.validateVideo(file);
    }

    if (skipped > 0) {
      this.uploadError = `Only ${this.MAX_FILES} files allowed. ${skipped} file(s) were skipped.`;
    }

    event.target.value = '';
  }

  // ── Image Validation ───────────────────────────
  // Rules: JPG/PNG · Max 10MB · Min 640×480px
  private validateImage(file: File) {
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
      reader.onload = (e: any) => {
        this.mediaFiles.push({
          file,
          previewUrl: e.target.result,
          isVideo: false,
          name: file.name,
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

  // ── Video Validation ───────────────────────────
  // Rules: MP4/MOV/3GP · Max 20MB · Max 30s · 640×480 to 1920×1080
  private validateVideo(file: File) {
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

    const video     = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload   = 'metadata';

    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const d = video.duration;

      // Duration check
      if (d > this.VIDEO_MAX_DURATION) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" is ${Math.round(d)}s long. Maximum allowed is ${this.VIDEO_MAX_DURATION} seconds.`;
        return;
      }

      // Min resolution check (640×480)
      if (w < this.VIDEO_MIN_WIDTH || h < this.VIDEO_MIN_HEIGHT) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" resolution ${w}×${h}px is too low. Minimum is ${this.VIDEO_MIN_WIDTH}×${this.VIDEO_MIN_HEIGHT}px.`;
        return;
      }

      // Max resolution check (1920×1080) — block 4K and above
      if (w > this.VIDEO_MAX_WIDTH || h > this.VIDEO_MAX_HEIGHT) {
        URL.revokeObjectURL(objectUrl);
        this.uploadError = `"${file.name}" resolution ${w}×${h}px is too high. Maximum is ${this.VIDEO_MAX_WIDTH}×${this.VIDEO_MAX_HEIGHT}px (Full HD).`;
        return;
      }

      // ✅ All checks passed
      this.mediaFiles.push({
        file,
        previewUrl: objectUrl,
        isVideo: true,
        name: file.name,
        sizeMB: (file.size / 1024 / 1024).toFixed(1)
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      this.uploadError = `Could not read "${file.name}". Please try another file.`;
    };

    video.src = objectUrl;
  }

  // ── Remove Single File ─────────────────────────
  removeMedia(index: number) {
    const removed = this.mediaFiles[index];
    if (removed.isVideo) URL.revokeObjectURL(removed.previewUrl);
    this.mediaFiles.splice(index, 1);
    this.uploadError = '';
  }

  setDepartment(d: string) { this.department = d; }
  nextStep() { if (this.currentStep < 3) this.currentStep++; }
  prevStep() { if (this.currentStep > 1) this.currentStep--; }
  get progressWidth() { return `${(this.currentStep / 3) * 100}%`; }

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

    const token   = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    if (this.mediaFiles.length > 0) {
      this.uploadFilesSequentially(0, [], headers);
    } else {
      this.submitWithMedia([], headers);
    }
  }

  private uploadFilesSequentially(index: number, uploadedUrls: string[], headers: HttpHeaders) {
    if (index >= this.mediaFiles.length) {
      this.submitWithMedia(uploadedUrls, headers);
      return;
    }

    const formData = new FormData();
    formData.append('file', this.mediaFiles[index].file);

    this.http.post('http://localhost:8080/api/upload', formData, { responseType: 'text' })
      .subscribe({
        next: (url) => {
          uploadedUrls.push(url);
          this.uploadFilesSequentially(index + 1, uploadedUrls, headers);
        },
        error: () => {
          this.message      = `Failed to upload "${this.mediaFiles[index].name}". Please try again.`;
          this.isSubmitting = false;
        }
      });
  }

  private submitWithMedia(imageUrls: string[], headers: HttpHeaders) {
    const complaintData = {
      title:       this.title,
      description: this.description,
      department:  this.department,
      priority:    this.priority,
      latitude:    this.latitude,
      longitude:   this.longitude,
      imageUrls:   imageUrls
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