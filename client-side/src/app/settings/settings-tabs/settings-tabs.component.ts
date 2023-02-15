import { TranslateService } from '@ngx-translate/core';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { PepHttpService } from '@pepperi-addons/ngx-lib';
import { ActivatedRoute } from '@angular/router';
import { DIMXHostObject, PepDIMXHelperService } from '@pepperi-addons/ngx-composite-lib'


@Component({
  selector: 'addon-settings-tabs',
  templateUrl: './settings-tabs.component.html',
  styleUrls: ['./settings-tabs.component.scss']
})
export class SettingsTabsComponent implements OnInit {
    tabs: Array<any>;
    activeTabIndex = 0;
    currentData: Promise<any>;
    weekNumber = 0;
    lastUpdatedDate: string;
    relationsData: {}[];
    UserDefinedTables: Number;
    NucleusTransactionLines: Number;
    NucleusActivities: Number;

    
    constructor(
      private dialogService: PepDialogService,
      private translate: TranslateService,
      private http: PepHttpService,
      public activatedRoute: ActivatedRoute,
      private viewContainerRef: ViewContainerRef,
      private dimxService: PepDIMXHelperService
    ) {

    }

    async ngOnInit() {
      this.activeTabIndex = 0;
      this.initData('get_latest_data');

      const dimxHostObject: DIMXHostObject = {
        DIMXAddonUUID: this.activatedRoute.snapshot.params.addonUUID,
        DIMXResource: 'UsageMonitor',
      }
      this.dimxService.register(this.viewContainerRef, dimxHostObject, (dimxEvent) => {})
    }

    menuItems = [
      {
        key: 'Update',
        text: 'Update'
      },
      {
        key: 'Export',
        text: 'Export'
      }
    ];

    initData(apiFunc: string) {
      let url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/' + apiFunc;
      this.http.getPapiApiCall(encodeURI(url)).subscribe(
          (latest_data_received) => {
              if (latest_data_received) {
                this.currentData = latest_data_received;
                
                this.weekNumber = latest_data_received.Week;
                this.lastUpdatedDate = new Date(latest_data_received.Key).toLocaleString();

                this.relationsData = latest_data_received.RelationsData;

                //for "update now" activate system health
                this.UserDefinedTables = latest_data_received.Data.UserDefinedTables;
                this.NucleusTransactionLines = latest_data_received.Data.NucleusTransactionLines;
                this.NucleusActivities = latest_data_received.Data.NucleusActivities;
              }
          },
          (error) => this.openErrorDialog(error),
          () => {}
      );
  }

    openErrorDialog(error){
        const title = this.translate.instant('MESSAGES.TITLE_NOTICE');
        const data = new PepDialogData({
            title,
            content: error?.fault?.faultstring || error
        });
        this.dialogService.openDefaultDialog(data);
    }

    tabClick(e){
        this.activeTabIndex = e.index;
    }

  getRelationDataTabLabel(tab) {
    return Object.keys(tab)[0];
  }

  async menuItemClick($event) {
    switch ($event.source.key) {
      case 'Update': {
        this.initData('collect_data'); // Generates updated data
        await this.updateSystemHealth('MonitorErrors')  //on "update now", call to system health
        break
      }
      case 'Export': {
        this.dimxService.export({
          DIMXExportFormat: "csv",
          DIMXExportIncludeDeleted: false,
          DIMXExportFileName: "export",
          DIMXExportDelimiter: ","
        });

        break
      }
    }
  }

  async updateSystemHealth(apiFunc: string) {
    debugger
    let usageMonitorUUID = this.activatedRoute.snapshot.params.addonUUID;
    let url = `/addons/api/${usageMonitorUUID}/api/` + apiFunc;
    let body = {
      NucleusTransactionLines: this.NucleusTransactionLines,
      NucleusActivities: this.NucleusActivities,
      UserDefinedTables:  this.UserDefinedTables
    }
    try{
      await this.http.postPapiApiCall(encodeURI(url), body).subscribe(
        (element) => {},
        (error) => this.openErrorDialog(error),
        () => {}
      );

    }
    catch(error){
      console.log(error)
    }
}

  onDIMXProcessDone($event) {
    //
  }
  
}
