import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';

/* Routes that need a light (white) body background */
const LIGHT_ROUTES = new Set([
  '/home',
  '/',
  '/login',
  '/register',
  '/citizen',
  '/officer',
  '/admin',
  '/create-complaint',
  '/notifications',
  '/heatmap',
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

  constructor(
    private readonly router: Router,
    private readonly renderer: Renderer2
  ) {
    /* Subscribe before ngOnInit so the very first navigation is caught */
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((e) => {
      this.applyBodyTheme(e.urlAfterRedirects);
    });
  }

  ngOnInit(): void {
    /* Apply theme for the initial URL on hard reload */
    this.applyBodyTheme(this.router.url);
    window.addEventListener('offline', () => {
      this.router.navigate(['/offline']);
    });
    window.addEventListener('online', () => {
      this.router.navigate(['/citizen']);
    });
  }

  ngOnDestroy(): void {
    this.routerSub.unsubscribe();
  }

  private applyBodyTheme(url: string): void {
    /* Strip query params and fragments for matching */
    const path = url.split('?')[0].split('#')[0];
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