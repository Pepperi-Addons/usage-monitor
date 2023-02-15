import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { EmptyRouteComponent } from './settings/empty-route/empty-route.component';


const routes: Routes = [
    {
        path: '',
        loadChildren: () => import('./settings/settings.module').then(m => m.SettingsModule),
    },
    {
        path: '**',
        component: EmptyRouteComponent
    }
];


@NgModule({
    imports: [
        RouterModule.forRoot(routes)
    ],
    exports: [RouterModule]
})
export class AppRoutingModule { }