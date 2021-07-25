import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TypesListComponent } from './components/types-list/types-list.component';
import { EmptyRouteComponent } from './components/empty-route/empty-route.component';
import { SettingsTabsComponent } from './components/settings-tabs/settings-tabs.component';

const routes: Routes = [{
    path: 'settings/:addon_uuid',

    children: [
        {
            path: 'Report',
            component: SettingsTabsComponent
        },
        {
            path: 'data',
            component: TypesListComponent
        },
        {
            path: 'usage',
            component: TypesListComponent
        }
    ]
    },
    {
        path: '**',
        component: EmptyRouteComponent
    }

];

@NgModule({
    imports: [RouterModule.forRoot(routes, { relativeLinkResolution: 'legacy' })],
    exports: [RouterModule]
})
export class AddonRoutingModule { }
