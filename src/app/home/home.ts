import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [RouterLink, CommonModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  constructor(private readonly router: Router, private readonly renderer: Renderer2) {}

  ngOnInit(): void {
    // Override the dark body background only while this page is active
    this.renderer.setStyle(document.body, 'background', '#ffffff');
    this.renderer.setStyle(document.body, 'color', '#111827');
    this.renderer.addClass(document.body, 'light-page');
  }

  ngOnDestroy(): void {
    // Restore the dark theme when navigating away
    this.renderer.removeStyle(document.body, 'background');
    this.renderer.removeStyle(document.body, 'color');
    this.renderer.removeClass(document.body, 'light-page');
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}