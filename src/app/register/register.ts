import { Component } from '@angular/core';
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
export class RegisterComponent {

  name = '';
  email = '';
  password = '';
  errorMessage = '';

  constructor(private http: HttpClient, private router: Router) {}

  register() {
    if (!this.name || !this.email || !this.password) {
      this.errorMessage = 'All fields are required';
      return;
    }

    this.http.post(
      'http://localhost:8080/api/auth/register',
      { name: this.name, email: this.email, password: this.password },
      { responseType: 'text' }  // ✅ backend returns plain String, not JSON
    ).subscribe({
      next: (res) => {
        console.log('✅ Response:', res);
        alert('Registration successful');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.log('❌ Error:', err);
        this.errorMessage = err.error?.message || err.error || 'Registration failed';
      }
    });
  }
}