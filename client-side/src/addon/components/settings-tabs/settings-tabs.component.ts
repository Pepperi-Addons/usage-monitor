import { TranslateService } from '@ngx-translate/core';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { Component, OnInit, ViewChild } from '@angular/core';
import { PepHttpService } from '@pepperi-addons/ngx-lib';
import { IPepButtonClickEvent } from '@pepperi-addons/ngx-lib/button';
import { DIMXComponent } from '@pepperi-addons/ngx-composite-lib/dimx-export';

@Component({
  selector: 'addon-settings-tabs',
  templateUrl: './settings-tabs.component.html',
  styleUrls: ['./settings-tabs.component.scss']
})
export class SettingsTabsComponent implements OnInit {
    @ViewChild('dimx') dimx:DIMXComponent | undefined;

    tabs: Array<any>;
    activeTabIndex = 0;
    currentData: Promise<any>;
    weekNumber = 0;
    lastUpdatedDate: string;
    relationsData: {}[];
    
    constructor(
      private dialogService: PepDialogService,
      private translate: TranslateService,
      private http: PepHttpService
    ) {

    }

    async ngOnInit() {
      this.activeTabIndex = 0;
      this.initData('get_latest_data');
    }

    initData(apiFunc: string) {
      let url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/' + apiFunc;
      this.http.getPapiApiCall(encodeURI(url)).subscribe(
          (latest_data_received) => {
              if (latest_data_received) {
                this.currentData = latest_data_received;
                
                this.weekNumber = latest_data_received.Week;
                this.lastUpdatedDate = new Date(latest_data_received.Key).toLocaleString();

                this.relationsData = latest_data_received.RelationsData;
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

    refreshButtonClicked(e: IPepButtonClickEvent) {
        this.initData('collect_data'); // Generates updated data
  }

  getRelationDataTabLabel(tab) {
    return Object.keys(tab)[0];
  }

  export($event){
    this.dimx?.DIMXExportRun({
      DIMXExportFormat: "csv",
      DIMXExportIncludeDeleted: false,
      DIMXExportFileName: "export",
      //DIMXExportFields: "",
      DIMXExportDelimiter: ";"
    });
  }

  onDIMXProcessDone($event) {
    //
  }
  
}
