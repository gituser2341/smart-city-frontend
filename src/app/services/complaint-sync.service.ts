import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { OfflineStorageService, OfflineComplaint } from './offline-storage.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ComplaintSyncService {
  private apiUrl = 'http://localhost:8080/api/complaints';
  pendingCount$ = new BehaviorSubject<number>(0);

  constructor(
    private http: HttpClient,
    private offlineStorage: OfflineStorageService
  ) {
    // Listen for online event to auto-sync
    window.addEventListener('online', () => {
      console.log('Back online! Syncing complaints...');
      this.syncPendingComplaints();
    });

    // Check pending count on init
    this.updatePendingCount();
  }

  async updatePendingCount() {
    const count = await this.offlineStorage.getPendingCount();
    this.pendingCount$.next(count);
  }

  // Convert base64 back to File for FormData
  private base64ToBlob(base64: string, type: string): Blob {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type });
  }

  async syncPendingComplaints(): Promise<void> {
    const pending = await this.offlineStorage.getAllPending();
    console.log(`Syncing ${pending.length} pending complaints...`);

    for (const complaint of pending) {
      try {
        await this.offlineStorage.updateStatus(complaint.id!, 'syncing');

        const headers = new HttpHeaders({
          'Authorization': `Bearer ${complaint.authToken}`
        });

        // Step 1 — Upload all media files first
        const imageUrls: string[] = [];

        // Parse all offline media files
        const allMedia = complaint.offlineMedia
          ? JSON.parse(complaint.offlineMedia)
          : complaint.imageBase64
            ? [{ base64: complaint.imageBase64, name: complaint.imageName, type: complaint.imageType }]
            : [];

        for (const media of allMedia) {
          if (media.base64 && media.name) {
            const blob = this.base64ToBlob(media.base64, media.type || 'image/jpeg');
            const uploadData = new FormData();
            uploadData.append('file', blob, media.name);

            const uploadedPath = await this.http
              .post<string>(
                'http://localhost:8080/api/upload',
                uploadData,
                { responseType: 'text' as 'json' }
              ).toPromise();

            if (uploadedPath) imageUrls.push(uploadedPath);
          }
        }

        // Step 2 — Submit complaint with uploaded image URLs
        await this.http.post(
          'http://localhost:8080/api/complaints/create',
          {
            title: complaint.title,
            description: complaint.description,
            department: complaint.department,
            priority: complaint.priority ?? 'MEDIUM',
            latitude: complaint.latitude,
            longitude: complaint.longitude,
            imageUrls
          },
          { headers }
        ).toPromise();

        await this.offlineStorage.deleteComplaint(complaint.id!);
        console.log(`✅ Synced complaint: ${complaint.title}`);

      } catch (error) {
        console.error(`❌ Failed to sync complaint:`, error);
        await this.offlineStorage.updateStatus(complaint.id!, 'failed');
      }
    }

    await this.updatePendingCount();
  }
}