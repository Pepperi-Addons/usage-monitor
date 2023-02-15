import { DoBootstrap, Injector, NgModule, Type } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { TranslateLoader, TranslateModule, TranslateService } from '@ngx-translate/core';
import { PepAddonService, PepNgxLibModule } from '@pepperi-addons/ngx-lib';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app.routes';

import { SettingsComponent, SettingsModule } from './settings';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TypesListComponent } from './settings/types-list/types-list.component';
import { SettingsTabsComponent } from './settings/settings-tabs/settings-tabs.component';
import { ChartDialogComponent } from './settings/types-list/chart-dialog/chart-dialog';
import { PepperiTableComponent } from './settings/types-list/pepperi-table/pepperi-table.component';
import { PepRemoteLoaderModule } from '@pepperi-addons/ngx-remote-loader';
import { HttpClientModule } from '@angular/common/http';
import { PepDialogModule, PepDialogService } from '@pepperi-addons/ngx-lib/dialog';
import { PepDIMXHelperService } from '@pepperi-addons/ngx-composite-lib'
import { config } from './app.config';
import { EmptyRouteComponent } from './settings/empty-route/empty-route.component';
import { PepListModule } from '@pepperi-addons/ngx-lib/list';
import { PepTopBarModule } from '@pepperi-addons/ngx-lib/top-bar';
import { PepMenuModule } from '@pepperi-addons/ngx-lib/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { PepPageLayoutModule } from '@pepperi-addons/ngx-lib/page-layout';

@NgModule({
    declarations: [

        AppComponent,
        TypesListComponent,
        SettingsTabsComponent,
        ChartDialogComponent,
        PepperiTableComponent,
        EmptyRouteComponent
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        HttpClientModule,
        PepNgxLibModule,
        PepListModule,
        PepTopBarModule,
        PepDialogModule,
        PepMenuModule,
        PepPageLayoutModule,
        MatTabsModule,
        SettingsModule,
        TranslateModule.forRoot({
            loader: {
                provide: TranslateLoader,
                useFactory: (addonService: PepAddonService) => 
                    PepAddonService.createMultiTranslateLoader(config.AddonUUID, addonService, ['ngx-lib', 'ngx-composite-lib']),
                deps: [PepAddonService]
            }
        }),
        AppRoutingModule,
        PepRemoteLoaderModule,
    ],
    providers: [PepDIMXHelperService ],
    bootstrap: [
        // AppComponent
    ]
})
export class AppModule implements DoBootstrap {
    constructor(
        private injector: Injector,
        translate: TranslateService,
        private pepAddonService: PepAddonService
    ) {
        this.pepAddonService.setDefaultTranslateLang(translate);
    }

    ngDoBootstrap() {
        this.pepAddonService.defineCustomElement(`settings-element-${config.AddonUUID}`, SettingsComponent, this.injector);

        // this.pepAddonService.defineCustomElement(`block-element-${config.AddonUUID}`, BlockComponent, this.injector);
        // this.pepAddonService.defineCustomElement(`block-editor-element-${config.AddonUUID}`, BlockEditorComponent, this.injector);
    }
}

