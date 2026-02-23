import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import * as L from 'leaflet';
import { RouterModule } from '@angular/router';

Chart.register(...registerables);

@Component({
  standalone: true,
  selector: 'app-admin',
  imports: [CommonModule,RouterModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class AdminComponent implements OnInit {

  private http = inject(HttpClient);

  total = 0;
  statusStats: any;

  ngOnInit() {
    this.loadCounts();
    this.loadStatusChart();
    this.loadDepartmentChart();
    this.loadMap();
  }

  // ✅ Existing count logic
  loadCounts() {
    this.http.get<number>('http://localhost:8080/api/admin/count')
      .subscribe(data => this.total = data);

    this.http.get<any>('http://localhost:8080/api/admin/count-by-status')
      .subscribe(data => this.statusStats = data);
  }

  // ✅ Pie Chart
  loadStatusChart() {
    this.http.get<any>('http://localhost:8080/api/admin/count-by-status')
      .subscribe(data => {

        new Chart("statusChart", {
          type: 'pie',
          data: {
            labels: ['OPEN', 'IN_PROGRESS', 'RESOLVED'],
            datasets: [{
              data: [
                data.OPEN || 0,
                data.IN_PROGRESS || 0,
                data.RESOLVED || 0
              ],
              backgroundColor: ['red', 'orange', 'green']
            }]
          }
        });
      });
  }

  loadMap() {

  const map = L.map('map').setView([17.3850, 78.4867], 12); // Default center

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  this.http.get<any[]>('http://localhost:8080/api/admin/all')
    .subscribe(complaints => {

      complaints.forEach(c => {

        if (c.latitude && c.longitude) {

          L.marker([c.latitude, c.longitude])
            .addTo(map)
            .bindPopup(`
              <b>${c.title}</b><br>
              ${c.department}<br>
              Status: ${c.status}
            `);

        }

      });

    });
}

  // ✅ Bar Chart
  loadDepartmentChart() {
    this.http.get<any>('http://localhost:8080/api/admin/count-by-department')
      .subscribe(data => {

        new Chart("deptChart", {
          type: 'bar',
          data: {
            labels: Object.keys(data),
            datasets: [{
              label: 'Complaints',
              data: Object.values(data),
              backgroundColor: 'blue'
            }]
          }
        });
      });
  }
}