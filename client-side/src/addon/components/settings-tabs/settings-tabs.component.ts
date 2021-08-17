import { TranslateService } from '@ngx-translate/core';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'addon-settings-tabs',
  templateUrl: './settings-tabs.component.html',
  styleUrls: ['./settings-tabs.component.scss']
})
export class SettingsTabsComponent implements OnInit {

    tabs: Array<any>;
    activeTabIndex = 0;
    
    constructor(
      private dialogService: PepDialogService,
      private translate: TranslateService,
    ) {

    }

    async ngOnInit() {
      this.activeTabIndex = 0;
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
