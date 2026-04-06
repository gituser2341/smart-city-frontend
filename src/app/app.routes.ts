import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { CitizenComponent } from './citizen/citizen';
import { OfficerComponent } from './officer/officer';
import { AdminComponent } from './admin/admin';
import { AddOfficerComponent } from './add-officer/add-officer';
import { RegisterComponent } from './register/register';
import { CreateComplaintComponent } from './create-complaint/create-complaint';
import { NotificationComponent } from './citizen/notification/notification';
import { HomeComponent } from './home/home';
import { authGuard } from './auth.guard';
import { HeatmapComponent } from './admin/heatmap/heatmap';  // ← fixed
import { DepartmentHeadComponent } from './department-head/department-head.component';
import { OfflineComponent } from './offline/offline.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'citizen', component: CitizenComponent, canActivate: [authGuard] },
  { path: 'officer', component: OfficerComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard] },
  { path: 'add-officer', component: AddOfficerComponent, canActivate: [authGuard] },
  { path: 'create-complaint', component: CreateComplaintComponent, canActivate: [authGuard] },
  { path: 'notifications', component: NotificationComponent, canActivate: [authGuard] },
  { path: 'heatmap', component: HeatmapComponent, canActivate: [authGuard] },
  { path: 'dh', component: DepartmentHeadComponent,canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];