import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {

  email = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;

  constructor(private http: HttpClient, private router: Router) {}

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  login() {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post<any>('http://localhost:8080/api/auth/login', {
      email: this.email,
      password: this.password
    }).subscribe({
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