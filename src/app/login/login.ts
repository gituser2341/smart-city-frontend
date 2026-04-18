import { Component, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

interface LoginResponse {
  token: string;
  role: string;
  email: string;
  id: number;
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
  ) { }

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

    if (!navigator.onLine) {
    // Check if already logged in
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (token && role) {
      // Already logged in — redirect to their dashboard
      if (role === 'CITIZEN') this.router.navigate(['/citizen']);
      else if (role === 'OFFICER') this.router.navigate(['/officer']);
      else if (role === 'ADMIN') this.router.navigate(['/admin']);
      else if (role === 'DEPARTMENT_HEAD') this.router.navigate(['/dh']);
    } else {
      // Not logged in + offline = show message
      this.errorMessage = '📴 You are offline. Please connect to internet to login.';
    }
    return;
  }
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post<LoginResponse>(
      'http://localhost:8080/api/auth/login',
      { email: this.email, password: this.password }
    ).subscribe({
      next: (res) => {
        this.isLoading = false;

        // ✅ Fix: store correctly using existing response fields
        localStorage.setItem('token', res.token);
        localStorage.setItem('role', res.role);
        localStorage.setItem('email', res.email);
        localStorage.setItem('userId', res.id.toString());
        localStorage.setItem('auth_token', res.token);

        // ✅ Fix: build user_data from actual response fields (res.user doesn't exist!)
        localStorage.setItem('user_data', JSON.stringify({
          id: res.id,
          email: res.email,
          role: res.role
        }));

        if (res.role === 'CITIZEN') {
          this.router.navigate(['/citizen']);
        } else if (res.role === 'OFFICER') {
          this.router.navigate(['/officer']);
        } else if (res.role === 'ADMIN') {
          this.router.navigate(['/admin']);
        } else if (res.role === 'DEPARTMENT_HEAD') {
          this.router.navigate(['/dh']);
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