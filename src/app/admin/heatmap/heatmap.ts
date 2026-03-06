import { Component, OnInit, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

interface Complaint {
  id: number;
  title: string;
  description: string;
  department: string;
  priority: 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  latitude: number;
  longitude: number;
  createdAt: string;
  user?: { name: string };
}

interface HeatPoint {
  id: number;
  title: string;
  department: string;
  priority: string;
  status: string;
  lat: number;
  lng: number;
  createdAt: string;
  x: number;
  y: number;
  radius: number;
  dotSize: number;
  color: string;
}

interface Hotspot {
  area: string;
  count: number;
  pct: number;
  color: string;
}

interface PriorityBreakdown {
  label: string;
  count: number;
  pct: number;
  color: string;
}

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './heatmap.html',
  styleUrls: ['./heatmap.css']
})
export class HeatmapComponent implements OnInit, AfterViewInit {

  @ViewChild('mapContainer') mapContainerRef!: ElementRef;

  allComplaints: Complaint[]      = [];
  filteredComplaints: Complaint[] = [];

  priorities  = ['ALL', 'EMERGENCY', 'HIGH', 'MEDIUM', 'LOW'];
  statuses    = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'];
  departments: string[] = [];

  selectedPriority = 'ALL';
  selectedStatus   = 'ALL';
  selectedDept     = 'ALL';

  isLoading = true;
  mapUrl!: SafeResourceUrl;
  mapWidth  = 800;
  mapHeight = 600;

  mapBboxLngMin =  76.88;
  mapBboxLngMax =  77.08;
  mapBboxLatMin =  10.92;
  mapBboxLatMax =  11.12;

  heatPoints: HeatPoint[] = [];

  selectedPoint: HeatPoint | null = null;
  tooltipX = 0;
  tooltipY = 0;

  legend: { label: string; color: string; count: number }[] = [];
  hotspots: Hotspot[] = [];
  priorityBreakdown: PriorityBreakdown[] = [];

  // ✦ pre-initialized so HTML never sees undefined
  statusCounts = { open: 0, inProgress: 0, resolved: 0 };

  recentComplaints: Complaint[] = [];

  private readonly PRIORITY_COLORS: Record<string, string> = {
    EMERGENCY: '#ef4444',
    HIGH:      '#f97316',
    MEDIUM:    '#eab308',
    LOW:       '#22c55e',
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.buildMapUrl();
    this.loadComplaints();
  }

  ngAfterViewInit() {
    if (this.mapContainerRef) {
      const el = this.mapContainerRef.nativeElement as HTMLElement;
      this.mapWidth  = el.offsetWidth  || 800;
      this.mapHeight = el.offsetHeight || 600;
      this.rebuildHeatPoints();
      this.cdr.detectChanges();
    }
  }

  buildMapUrl() {
    const bbox = `${this.mapBboxLngMin},${this.mapBboxLatMin},${this.mapBboxLngMax},${this.mapBboxLatMax}`;
    const raw  = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
    this.mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(raw);
  }

  loadComplaints() {
    const token   = localStorage.getItem('token');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    // ✦ FIXED: was /api/admin/complaints (403), now /api/admin/all-complaints
    this.http.get<Complaint[]>('http://localhost:8080/api/admin/all-complaints', { headers })
      .subscribe({
        next: (data) => {
          this.allComplaints = data ?? [];
          this.departments   = [...new Set(data.map(c => c.department))].sort();

          // Auto-fit map bbox to complaint coordinates
          const lats = data.map(c => c.latitude).filter(Boolean);
          const lngs = data.map(c => c.longitude).filter(Boolean);
          if (lats.length) {
            const pad = 0.02;
            this.mapBboxLatMin = Math.min(...lats) - pad;
            this.mapBboxLatMax = Math.max(...lats) + pad;
            this.mapBboxLngMin = Math.min(...lngs) - pad;
            this.mapBboxLngMax = Math.max(...lngs) + pad;
            this.buildMapUrl();
          }

          this.applyFilters();
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Heatmap load error:', err);
          this.isLoading = false;
          if (err.status === 401 || err.status === 403)
            this.router.navigate(['/login']);
          this.cdr.detectChanges();
        }
      });
  }

  setPriority(p: string) { this.selectedPriority = p; this.applyFilters(); }
  setStatus(s: string)   { this.selectedStatus   = s; this.applyFilters(); }

  applyFilters() {
    this.filteredComplaints = this.allComplaints.filter(c => {
      const okP = this.selectedPriority === 'ALL' || c.priority   === this.selectedPriority;
      const okS = this.selectedStatus   === 'ALL' || c.status     === this.selectedStatus;
      const okD = this.selectedDept     === 'ALL' || c.department === this.selectedDept;
      return okP && okS && okD;
    });
    this.rebuildHeatPoints();
    this.buildSidebarData();
    this.selectedPoint = null;
    this.cdr.detectChanges();
  }

  resetFilters() {
    this.selectedPriority = 'ALL';
    this.selectedStatus   = 'ALL';
    this.selectedDept     = 'ALL';
    this.applyFilters();
  }

  private projectToPixel(lat: number, lng: number): { x: number; y: number } {
    const x = ((lng - this.mapBboxLngMin) / (this.mapBboxLngMax - this.mapBboxLngMin)) * this.mapWidth;
    const y = ((this.mapBboxLatMax - lat)  / (this.mapBboxLatMax - this.mapBboxLatMin)) * this.mapHeight;
    return { x: Math.round(x), y: Math.round(y) };
  }

  rebuildHeatPoints() {
    this.heatPoints = this.filteredComplaints
      .filter(c => c.latitude && c.longitude)
      .map(c => {
        const { x, y } = this.projectToPixel(c.latitude, c.longitude);
        const dotSize = c.priority === 'EMERGENCY' ? 7
                      : c.priority === 'HIGH'      ? 6
                      : c.priority === 'MEDIUM'    ? 5 : 4;
        const radius  = c.priority === 'EMERGENCY' ? 70
                      : c.priority === 'HIGH'      ? 55
                      : c.priority === 'MEDIUM'    ? 42 : 32;
        return {
          id: c.id, title: c.title, department: c.department,
          priority: c.priority, status: c.status,
          lat: c.latitude, lng: c.longitude, createdAt: c.createdAt,
          x, y, radius, dotSize,
          color: this.PRIORITY_COLORS[c.priority] ?? '#64748b',
        };
      });
  }

  buildSidebarData() {
    const data  = this.filteredComplaints;
    const total = data.length || 1;

    // Legend
    this.legend = [
      { label: 'Emergency', color: '#ef4444', count: data.filter(c => c.priority === 'EMERGENCY').length },
      { label: 'High',      color: '#f97316', count: data.filter(c => c.priority === 'HIGH').length      },
      { label: 'Medium',    color: '#eab308', count: data.filter(c => c.priority === 'MEDIUM').length    },
      { label: 'Low',       color: '#22c55e', count: data.filter(c => c.priority === 'LOW').length       },
    ];

    // ✦ Status counts — handles both OPEN and missing status gracefully
    this.statusCounts = {
      open:       data.filter(c => c.status === 'OPEN').length,
      inProgress: data.filter(c => c.status === 'IN_PROGRESS').length,
      resolved:   data.filter(c => c.status === 'RESOLVED').length,
    };

    // Priority breakdown %
    this.priorityBreakdown = [
      { label: 'Emergency', color: '#ef4444', count: data.filter(c => c.priority === 'EMERGENCY').length, pct: 0 },
      { label: 'High',      color: '#f97316', count: data.filter(c => c.priority === 'HIGH').length,      pct: 0 },
      { label: 'Medium',    color: '#eab308', count: data.filter(c => c.priority === 'MEDIUM').length,    pct: 0 },
      { label: 'Low',       color: '#22c55e', count: data.filter(c => c.priority === 'LOW').length,       pct: 0 },
    ].map(p => ({ ...p, pct: Math.round((p.count / total) * 100) }));

    // Hotspot areas by department
    const deptMap: Record<string, number> = {};
    data.forEach(c => { deptMap[c.department] = (deptMap[c.department] || 0) + 1; });
    const maxCount  = Math.max(...Object.values(deptMap), 1);
    const hotColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

    this.hotspots = Object.entries(deptMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([area, count], i) => ({
        area, count,
        pct:   Math.round((count / maxCount) * 100),
        color: hotColors[i] ?? '#64748b',
      }));

    // Recent complaints sorted by date
    this.recentComplaints = [...data]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }

  selectComplaint(point: HeatPoint) {
    this.selectedPoint = point;
    const mapEl = this.mapContainerRef?.nativeElement as HTMLElement;
    const rect  = mapEl?.getBoundingClientRect();
    const rawX  = (point.x / this.mapWidth)  * (rect?.width  ?? this.mapWidth);
    const rawY  = (point.y / this.mapHeight) * (rect?.height ?? this.mapHeight);
    this.tooltipX = Math.min(rawX + 14, (rect?.width  ?? this.mapWidth)  - 250);
    this.tooltipY = Math.max(rawY - 160, 8);
    this.cdr.detectChanges();
  }

  focusComplaint(c: Complaint) {
    const point = this.heatPoints.find(p => p.id === c.id);
    if (point) this.selectComplaint(point);
  }

  getPriorityColor(priority: string): string {
    return this.PRIORITY_COLORS[priority] ?? '#64748b';
  }
}