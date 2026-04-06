import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface PendingComplaint {
  id:          string;
  title:       string;
  description: string;
  location:    string;
  department:  string;
  priority:    string;
  latitude:    number | null;
  longitude:   number | null;
  timestamp:   number;
  status:      'PENDING_SYNC' | 'SYNCING' | 'FAILED';
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {

  private readonly KEY    = 'civic_pending_complaints';
  private readonly BASE   = 'http://localhost:8080/api/chatbot';
  private isSyncing       = false;

  constructor(private http: HttpClient) {
    // Listen for network recovery
    window.addEventListener('online', () => this.syncAll());
  }

  private get headers() {
    return new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`
    });
  }

  // ── Queue management ───────────────────────────────────────────

  getAll(): PendingComplaint[] {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  add(complaint: Omit<PendingComplaint, 'id' | 'timestamp' | 'status'>): string {
    const queue = this.getAll();
    const id    = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    queue.push({ ...complaint, id, timestamp: Date.now(), status: 'PENDING_SYNC' });
    this.save(queue);
    return id;
  }

  remove(id: string) {
    this.save(this.getAll().filter(c => c.id !== id));
  }

  updateStatus(id: string, status: PendingComplaint['status']) {
    const queue = this.getAll().map(c =>
      c.id === id ? { ...c, status } : c
    );
    this.save(queue);
  }

  get pendingCount(): number {
    return this.getAll().filter(c => c.status === 'PENDING_SYNC').length;
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  private save(queue: PendingComplaint[]) {
    localStorage.setItem(this.KEY, JSON.stringify(queue));
  }

  // ── Sync ───────────────────────────────────────────────────────

  syncAll(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) return Promise.resolve({ success: 0, failed: 0 });

    const pending = this.getAll().filter(c => c.status === 'PENDING_SYNC');
    if (pending.length === 0) return Promise.resolve({ success: 0, failed: 0 });

    this.isSyncing = true;

    const results = { success: 0, failed: 0 };
    const promises = pending.map(complaint =>
      this.syncOne(complaint)
        .then(() => { results.success++; })
        .catch(() => { results.failed++; })
    );

    return Promise.all(promises).then(() => {
      this.isSyncing = false;
      return results;
    });
  }

  private syncOne(complaint: PendingComplaint): Promise<void> {
    this.updateStatus(complaint.id, 'SYNCING');

    return new Promise((resolve, reject) => {
      this.http.post(
        `${this.BASE}/submit-complaint`,
        {
          title:       complaint.title,
          description: complaint.description,
          location:    complaint.location,
          department:  complaint.department,
          priority:    complaint.priority,
          latitude:    complaint.latitude,
          longitude:   complaint.longitude
        },
        { headers: this.headers }
      ).subscribe({
        next: () => {
          this.remove(complaint.id);
          resolve();
        },
        error: () => {
          this.updateStatus(complaint.id, 'FAILED');
          reject();
        }
      });
    });
  }
}