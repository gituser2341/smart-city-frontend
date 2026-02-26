import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { CitizenComponent } from './citizen/citizen';
import { OfficerComponent } from './officer/officer';
import { AdminComponent } from './admin/admin';
import { AddOfficerComponent } from './add-officer/add-officer';
import { RegisterComponent } from './register/register';
import { CreateComplaintComponent } from './create-complaint/create-complaint';
import { NotificationComponent } from './citizen/notification/notification';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'citizen', component: CitizenComponent, canActivate: [authGuard] },
  { path: 'officer', component: OfficerComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard] },
  { path: 'add-officer', component: AddOfficerComponent, canActivate: [authGuard] },
  { path: 'create-complaint', component: CreateComplaintComponent, canActivate: [authGuard] },
  { path: 'notifications', component: NotificationComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' }
];