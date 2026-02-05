import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <h2>Login</h2>

    <form (ngSubmit)="login()">
      <input type="email" [(ngModel)]="email" name="email" placeholder="Email" required />
      <br><br>
      <input type="password" [(ngModel)]="password" name="password" placeholder="Password" required />
      <br><br>
      <button type="submit">Login</button>
    </form>

    <p style="color:red">{{ errorMessage }}</p>
  `,
  styleUrls: ['./login.css']
})
export class LoginComponent {

  email = '';
  password = '';
  errorMessage = '';

  constructor(private http: HttpClient, private router: Router) {}

  login() {
    this.http.post<any>('http://localhost:8080/api/auth/login', {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (res) => {
        // store role (optional)
        localStorage.setItem('role', res.role);

        if (res.role === 'CITIZEN') {
          this.router.navigate(['/citizen']);
        } else if (res.role === 'OFFICER') {
          this.router.navigate(['/officer']);
        } else if (res.role === 'ADMIN') {
          this.router.navigate(['/admin']);
        } else {
          this.errorMessage = 'Unknown role';
        }
      },
      error: () => {
        this.errorMessage = 'Invalid credentials';
      }
    });
  }
}
