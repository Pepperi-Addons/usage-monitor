import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SettingsComponent } from './settings.component';
import { TypesListComponent } from './types-list/types-list.component';
import { SettingsTabsComponent } from './settings-tabs/settings-tabs.component';
import { EmptyRouteComponent } from './empty-route/empty-route.component';

const routes: Routes = [
    {
        path: ':settingsSectionName/:addonUUID/:slugName',
        component: SettingsComponent,
        children: [
            {
                path: '',
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
    imports: [
        RouterModule.forChild(routes),
    ],
    exports: [RouterModule]
})
export class SettingsRoutingModule { }



