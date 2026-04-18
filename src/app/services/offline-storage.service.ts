import { Injectable } from '@angular/core';

export interface OfflineComplaint {
  id?: number;
  title: string;
  description: string;
  category: string;
  department: string;
  location: string;
  latitude?: number;
  longitude?: number;
  priority?: string;          // ← add
  offlineMedia?: string; 
  userId: string;
  authToken: string;
  imageBase64?: string;
  imageName?: string;
  imageType?: string;
  createdAt: number;
  syncStatus: 'pending' | 'syncing' | 'failed';
}

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private dbName = 'CivicPulseDB';
  private dbVersion = 1;
  private storeName = 'offline_complaints';
  private db: IDBDatabase | null = null;

  async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('syncStatus', 'syncStatus', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async saveComplaint(complaint: OfflineComplaint): Promise<number> {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(complaint);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingComplaints(): Promise<OfflineComplaint[]> {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('syncStatus');
      const request = index.getAll('pending');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPending(): Promise<OfflineComplaint[]> {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(
        request.result.filter(c => c.syncStatus === 'pending' || c.syncStatus === 'failed')
      );
      request.onerror = () => reject(request.error);
    });
  }

  async updateStatus(id: number, status: 'pending' | 'syncing' | 'failed'): Promise<void> {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        record.syncStatus = status;
        store.put(record);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async deleteComplaint(id: number): Promise<void> {
    await this.initDB();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingCount(): Promise<number> {
    const pending = await this.getAllPending();
    return pending.length;
  }
}