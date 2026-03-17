import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './register.html',
  styleUrls: ['./register.css']
})
export class RegisterComponent implements OnInit, OnDestroy {

  name = '';
  email = '';
  password = '';
  errorMessage = '';
  successMessage = '';
  isLoading = false;
  showPassword = false;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.renderer.setStyle(document.body, 'background', '#ffffff');
    this.renderer.setStyle(document.body, 'color', '#111827');
  }

  ngOnDestroy(): void {
    this.renderer.removeStyle(document.body, 'background');
    this.renderer.removeStyle(document.body, 'color');
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  register(): void {
    if (!this.name || !this.email || !this.password) {
      this.errorMessage = 'All fields are required.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.http.post(
      'http://localhost:8080/api/auth/register',
      { name: this.name, email: this.email, password: this.password },
      { responseType: 'text' }
    ).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Account created successfully! Redirecting...';
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || err.error || 'Registration failed. Please try again.';
      }
    });
  }
}