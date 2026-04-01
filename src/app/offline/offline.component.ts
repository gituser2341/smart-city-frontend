import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-offline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:100vh;gap:1rem;padding:2rem;text-align:center">
      <div style="font-size:48px">📡</div>
      <h2 style="font-weight:500">You are offline</h2>
      <p style="color:var(--color-text-secondary);max-width:300px">
        Please check your internet connection. Your drafted complaints will sync automatically when you're back online.
      </p>
      <button (click)="retry()" style="padding:10px 24px;border-radius:8px;
              border:0.5px solid var(--color-border-secondary);
              background:var(--color-background-primary);cursor:pointer;font-size:14px">
        Try again
      </button>
    </div>
  `
})
export class OfflineComponent {
  constructor(private router: Router) {}
  retry(): void { window.location.reload(); }
}