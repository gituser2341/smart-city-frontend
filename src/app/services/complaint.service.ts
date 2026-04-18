import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { OfflineStorageService } from './offline-storage.service';
import { ComplaintSyncService } from './complaint-sync.service';

@Injectable({ providedIn: 'root' })
export class ComplaintService {
  private apiUrl = 'http://localhost:8080/api/complaints';

  constructor(
    private http: HttpClient,
    private offlineStorage: OfflineStorageService,
    private syncService: ComplaintSyncService
  ) {}

  // Convert image File to base64 for IndexedDB storage
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async submitComplaint(formData: {
    title: string;
    description: string;
    category: string;
    department: string;
    location: string;
    latitude?: number;
    longitude?: number;
    image?: File;
    userId: string;
    authToken: string;
  }): Promise<{ success: boolean; offline: boolean; message: string }> {

    if (navigator.onLine) {
      // ── ONLINE: submit directly ──
      try {
        const data = new FormData();
        data.append('title', formData.title);
        data.append('description', formData.description);
        data.append('category', formData.category);
        data.append('department', formData.department);
        data.append('location', formData.location);
        data.append('userId', formData.userId);
        if (formData.latitude) data.append('latitude', String(formData.latitude));
        if (formData.longitude) data.append('longitude', String(formData.longitude));
        if (formData.image) data.append('image', formData.image);

        const headers = new HttpHeaders({
          'Authorization': `Bearer ${formData.authToken}`
        });

        await this.http.post(this.apiUrl, data, { headers }).toPromise();
        return { success: true, offline: false, message: 'Complaint submitted successfully!' };

      } catch (error) {
        return { success: false, offline: false, message: 'Submission failed. Please try again.' };
      }

    } else {
      // ── OFFLINE: save to IndexedDB ──
      try {
        let imageBase64: string | undefined;

        if (formData.image) {
          imageBase64 = await this.fileToBase64(formData.image);
        }

        await this.offlineStorage.saveComplaint({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          department: formData.department,
          location: formData.location,
          latitude: formData.latitude,
          longitude: formData.longitude,
          userId: formData.userId,
          authToken: formData.authToken,
          imageBase64,
          imageName: formData.image?.name,
          imageType: formData.image?.type,
          createdAt: Date.now(),
          syncStatus: 'pending'
        });

        await this.syncService.updatePendingCount();
        return {
          success: true,
          offline: true,
          message: '📴 Saved offline! Will submit automatically when back online.'
        };

      } catch (error) {
        return { success: false, offline: true, message: 'Failed to save offline.' };
      }
    }
  }
}