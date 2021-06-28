
import { relationTypesEnum, RemoteModuleOptions } from './../../../../../model';
import { TranslateService } from '@ngx-translate/core';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { ChangeDetectorRef, Component, ComponentFactory, ComponentRef, Input, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PepHttpService } from '@pepperi-addons/ngx-lib';
import { TitleCasePipe } from '@angular/common';
import { Types } from '@pepperi-addons/papi-sdk/dist/endpoints';
import { PepRemoteLoaderComponent } from '@pepperi-addons/ngx-remote-loader';




@Component({
  selector: 'addon-settings-tabs',
  templateUrl: './settings-tabs.component.html',
  styleUrls: ['./settings-tabs.component.scss']
})
export class SettingsTabsComponent implements OnInit {

    atd;
    tabs: Array<any>;
    activeTab: RemoteModuleOptions;
    activeTabIndex = 0;
    data = {atd: null, tab: null, addon: null};
    addonBaseURL;
    @ViewChild('addonProxy', {static: false}) addonProxy: PepRemoteLoaderComponent;
    @Input() title = '';
    @Input() type;
    @Input() subType;
    typesEnum = {
        'accounts': 'Account',
        'transactions': 'Orders',
        'activities': 'Activity',
        'transaction_lines': 'Lines',
        'contacts': 'Contact'
    }
    private titleCase = new TitleCasePipe();

    constructor(
      private route: ActivatedRoute,
      private router: Router,
      private http: PepHttpService,
      private dialogService: PepDialogService,
      private translate: TranslateService,
      private cd: ChangeDetectorRef,
    ) {

    }

    async ngOnInit() {

      this.type = this.route.snapshot.params.type;
      this.subType = this.route.snapshot.params.sub_type;
      const addonUUID = this.route.snapshot.params.addon_uuid;
      this.addonBaseURL = this.route.snapshot.queryParams.addon_base_url;
      this.getTabs(addonUUID).then(res =>{
           this.tabs = res.sort((x,y) => x.index - y.index);
           this.activeTab = this.tabs.find((tab,index) => {
                this.activeTabIndex = index;
                tab.remoteEntry = this.addonBaseURL ? `${this.addonBaseURL+tab.remoteName}.js` : tab.remoteEntry;
                return tab.title.toLowerCase() === this.route.snapshot.params['tab_id'];
            });
        this.getAtd();
      });

    }

    getAtd() {
      return this.http.getPapiApiCall(`/meta_data/${this.route.snapshot.params.type}/types/${this.route.snapshot.params['type_id']}`).subscribe(atd => {
          this.tabs.forEach(tab => tab.remoteName === 'settings_iframe' ? tab.path = this.getIframePath(tab.title.toLowerCase(), atd ) : null);
          this.atd = atd;
          return atd;
      });
    }

    getIframePath(tabName, atd) {
        let URI = `Views/Agents/${this.typesEnum[this.type]}Types.aspx?objectUUID=${atd.InternalID}&tabName=${tabName.toUpperCase()}`;
        URI += `&name=${atd.ExternalID}&description=${atd.Description}&icon_name=${atd.Icon}`;
        return URI;
    }

    openErrorDialog(error){
        const title = this.translate.instant('MESSAGES.TITLE_NOTICE');
        const data = new PepDialogData({
            title,
            content: error?.fault?.faultstring || error
        });
        this.dialogService.openDefaultDialog(data);
    }

    getAddon(tab) {
        return this.http.getPapiApiCall(`/addons/installed_addons/${tab.AddonUUID}`);
    }

    onAddonChange(e){
        this.getAtd();
    }

    tabClick(e){
        const currentTabKey = this.activeTab?.title;
        const selectedTab: RemoteModuleOptions = this.activeTab ? this.tabs.find(tab => tab?.title === e?.tab?.textLabel): this.tabs[this.tabs?.length-1];

        if (this.activeTab?.remoteName === 'settings_iframe'){
            const addonInstance = this.addonProxy?.compRef?.instance;
            const iframeWindow =  addonInstance?.settingsIframe?.nativeElement?.contentWindow;
            iframeWindow?.postMessage({msgName: 'tabClick', tabName: selectedTab.title.toLowerCase()}, '*');
        }
        if (selectedTab && selectedTab?.title !== currentTabKey){
            this.cd.detectChanges();
            if (selectedTab.uuid === this.activeTab.uuid){
                selectedTab.update = true;
            }

            if (this.activeTab?.remoteName !== selectedTab?.remoteName){
                this.activeTab = null;
                this.cd.detectChanges();
                this.activeTab = selectedTab;
            }
            this.activeTabIndex = e.index;
            this.router.navigate([`../${selectedTab.title.toLowerCase()}`],
            { relativeTo: this.route});
        }
    }

    goBack(){
        this.router.navigate(['../../'], { relativeTo: this.route  } );
    }

    getTabs(addonUUID, relationName = `${relationTypesEnum[this.type]}TypeListTabs`): Promise<any[]> {
        const body = { RelationName: relationName };
        // debug locally
        // return this.http.postHttpCall('http://localhost:4500/api/relations', body)
        return this.http.postPapiApiCall(`/addons/api/${addonUUID}/api/relations`, body)
                    .toPromise();
    }


}
