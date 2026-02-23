import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-add-officer',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './add-officer.html',
  styleUrls: ['./add-officer.css']
})
export class AddOfficerComponent {

  name = '';
  email = '';
  password = '';
  department = '';
  message = '';
  errorMessage = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}
  
  addOfficer() {

    if (!this.name || !this.email || !this.password || !this.department) {
      this.errorMessage = "All fields are required";
      return;
    }

    const token = localStorage.getItem('token');

    this.http.post(
      'http://localhost:8080/api/admin/add-officer',
      {
        name: this.name,
        email: this.email,
        password: this.password,
        department: this.department
      },
      {
        responseType: 'text' as 'json',
        
      }
    ).subscribe({
      next: (res : any) => {
        console.log('✅ Success:', res);
        this.message = "Officer added successfully";
        this.errorMessage = '';
        this.name = '';
        this.email = '';
        this.password = '';
        this.department = '';
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.log('❌ Status:', err.status);
        console.log('❌ Error:', err.error);
        console.log('❌ Full error:', err);
        this.errorMessage = err.error || "Failed to add officer";
        this.message = '';
        this.cdr.detectChanges();
}
    });
  }
}