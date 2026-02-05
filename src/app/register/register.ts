import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './register.html',
  styleUrls: ['./register.css']
})
export class RegisterComponent {

  name = '';
  email = '';
  password = '';
  role = '';
  errorMessage = '';

  constructor(private http: HttpClient, private router: Router) {}

  register() {
    this.http.post(
      'http://localhost:8080/api/auth/register',
      {
        name: this.name,
        email: this.email,
        password: this.password,
        role: this.role
      }
    ).subscribe({
      next: () => {
        alert('Registration successful');
        this.router.navigate(['/login']);
      },
      error: () => {
        this.errorMessage = 'Registration failed';
      }
    });
  }
}
