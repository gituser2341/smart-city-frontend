import { Component, OnInit,inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  standalone : true,
  selector: 'app-admin',
  imports: [CommonModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent {
  private http = inject(HttpClient); 
  total = 0;
statusStats: any;

ngOnInit() {

  this.http.get<number>('http://localhost:8080/api/admin/count')
    .subscribe(data => this.total = data);

  this.http.get<any>('http://localhost:8080/api/admin/count-by-status')
    .subscribe(data => this.statusStats = data);
}

}
