import { TranslateService } from '@ngx-translate/core';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { Component, OnInit } from '@angular/core';
import { PepHttpService } from '@pepperi-addons/ngx-lib';

@Component({
  selector: 'addon-settings-tabs',
  templateUrl: './settings-tabs.component.html',
  styleUrls: ['./settings-tabs.component.scss']
})
export class SettingsTabsComponent implements OnInit {

    tabs: Array<any>;
    activeTabIndex = 0;
    currentData: Promise<any>;
    
    constructor(
      private dialogService: PepDialogService,
      private translate: TranslateService,
      private http: PepHttpService
    ) {

    }

    async ngOnInit() {
      this.activeTabIndex = 0;
      this.initData('collect_data');
    }

    initData(apiFunc: string) {
      let url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/' + apiFunc;
      this.http.getPapiApiCall(encodeURI(url)).subscribe(
          (latest_data_received) => {
              if (latest_data_received) {
                this.currentData = latest_data_received;
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
}
