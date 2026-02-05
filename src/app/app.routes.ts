import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { CitizenComponent } from './citizen/citizen';
import { OfficerComponent } from './officer/officer';
import { AdminComponent } from './admin/admin';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'citizen', component: CitizenComponent, canActivate: [authGuard] },
  { path: 'officer', component: OfficerComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
  {
  path: 'register',
  loadComponent: () =>
    import('./register/register').then(m => m.RegisterComponent)
}
];
