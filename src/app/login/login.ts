import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

interface LoginResponse {
  token: string;
  role: string;
  email: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit, OnDestroy {

  email = '';
  password = '';
  errorMessage = '';
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

  login(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post<LoginResponse>(
      'http://localhost:8080/api/auth/login',
      { email: this.email, password: this.password }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        localStorage.setItem('token', res.token);
        localStorage.setItem('role', res.role);
        localStorage.setItem('email', res.email);

        if (res.role === 'CITIZEN') {
          this.router.navigate(['/citizen']);
        } else if (res.role === 'OFFICER') {
          this.router.navigate(['/officer']);
        } else if (res.role === 'ADMIN') {
          this.router.navigate(['/admin']);
        } else {
          this.errorMessage = 'Unknown role. Please contact support.';
        }
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Invalid email or password. Please try again.';
      }
    });
  }
}