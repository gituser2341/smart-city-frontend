import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { inject } from '@angular/core';
import { isDevMode } from '@angular/core';

const LIGHT_ROUTES = new Set([
  '/home', '/', '/login', '/register', '/citizen',
  '/officer', '/admin', '/dh', '/create-complaint',
  '/notifications', '/heatmap',
]);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, OnDestroy {

  private readonly routerSub: Subscription;
  private readonly swUpdate = inject(SwUpdate);

  constructor(
    private readonly router:   Router,
    private readonly renderer: Renderer2
  ) {
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((e) => {
      this.applyBodyTheme(e.urlAfterRedirects);
    });
  }

  ngOnInit(): void {
    this.applyBodyTheme(this.router.url);
    this.initSwUpdate();
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }

  private initSwUpdate(): void {
    if (!this.swUpdate.isEnabled) { return; }

    // Auto-reload when new version is ready
    this.swUpdate.versionUpdates.pipe(
      filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')
    ).subscribe(() => {
      window.location.reload();
    });

    // Check for updates every 6 hours
    setInterval(() => {
      this.swUpdate.checkForUpdate().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  }

  private applyBodyTheme(url: string): void {
    const path    = url.split('?')[0].split('#')[0];
    const isLight = LIGHT_ROUTES.has(path);

    if (isLight) {
      this.renderer.setStyle(document.body, 'background', '#ffffff');
      this.renderer.setStyle(document.body, 'color',      '#111827');
      this.renderer.addClass(document.body,    'theme-light');
      this.renderer.removeClass(document.body, 'theme-dark');
    } else {
      this.renderer.removeStyle(document.body, 'background');
      this.renderer.removeStyle(document.body, 'color');
      this.renderer.addClass(document.body,    'theme-dark');
      this.renderer.removeClass(document.body, 'theme-light');
    }
  }
}