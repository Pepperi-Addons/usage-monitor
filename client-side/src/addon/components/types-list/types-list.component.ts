import { ListSearch, ObjectType, relationTypesEnum, RemoteModuleOptions } from './../../../../../model';
import { PepperiTableComponent } from './pepperi-table/pepperi-table.component';
import { AddTypeDialogComponent } from './add-type-dialog/add-type-dialog.component';
import { Component, ComponentRef, Input, OnInit, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { PepHttpService, PepSessionService } from '@pepperi-addons/ngx-lib';
import { PepDialogService, PepDialogActionButton, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { PepMenuItem, IPepMenuItemClickEvent } from '@pepperi-addons/ngx-lib/menu';
import { MatDialog } from '@angular/material/dialog';
import { PepListActionsComponent } from '@pepperi-addons/ngx-lib/list';
import { PapiClient } from '@pepperi-addons/papi-sdk';
import { IPepButtonClickEvent } from '@pepperi-addons/ngx-lib/button';
import { Subscription } from 'rxjs';

@Component({
    selector: 'addon-pepperi-list-exmaple',
    templateUrl: './types-list.component.html',
    styleUrls: ['./types-list.component.scss']
})
export class TypesListComponent implements OnInit {

    @ViewChild('dialogTemplate', { read: TemplateRef }) dialogTemplate: TemplateRef<any>;
    @ViewChild('listActions') listActions: PepListActionsComponent;
    @ViewChild(PepperiTableComponent) table: PepperiTableComponent;

    // List variables
    leftMenuItems: Promise<PepMenuItem[]>;
    rightMenuItems: PepMenuItem[];
    totalRows = 0;
    displayedColumns: string[];
    //transactionTypes;
    latestData: { Setup: any; Data: any; Usage: any; };
    latestDataArray: { Data: string; Description: string; Size: number; Prefix: string; }[];
    searchString = '';
    searchAutoCompleteValues: any;
    addonUUID: any;
    showListActions = false;
    dialogRef: Subscription;
    dialogAddon: RemoteModuleOptions;
    viewContainer: ViewContainerRef;
    compRef: ComponentRef<any>;
    selectedRows = 0;
    papi: PapiClient;
    @Input() type: any;
    @Input() subType: any;
    titlePipe = new TitleCasePipe();
    addonBaseURL = '';
    weekNumber = 0;
    lastUpdatedDate: string;


    constructor(
        private translate: TranslateService,
        private http: PepHttpService,
        private dialogService: PepDialogService,
        private session: PepSessionService,
        private router: Router,
        private route: ActivatedRoute

    ) {
        this.addonUUID = route.snapshot.params.addon_uuid;
        this.papi = new PapiClient({
            baseURL: this.session.getPapiBaseUrl(),
            token: this.session.getIdpToken()
        });
    }

    async ngOnInit() {
        this.route.params.subscribe( params => {
            this.type = params.type;
            this.subType = params.sub_type;
            const addonUUID = params.addon_uuid;
            this.leftMenuItems = this.getMenu(addonUUID);
            this.rightMenuItems = this.getRightMenu();
            this.loadlist();
        })

        this.route.queryParams.subscribe( queryParams => {
            this.addonBaseURL = queryParams?.addon_base_url;
        })


    }

    // List functions
    customizeDataRowField(object: any, key: any, dataRowField: any) {

        switch (key) {
            case 'Data':
                //dataRowField.FormattedValue = object[key]?.UserDefinedTablesLines?.toString();//JSON.stringify(object[key]);
                //dataRowField.FormattedValue = this.translate.instant(object[key]);
                //dataRowField.FormattedValue = object[key];
                dataRowField.AdditionalValue = object.Prefix;
                break;
            case 'Description':
                dataRowField.ColumnWidth = 65;
                //dataRowField.FormattedValue = "Description for " + object.Data;
                break;
            case 'Size':
                //dataRowField.AdditionalValue = object;
                dataRowField.ColumnWidth = 35;
                break;
            default:
                dataRowField.FormattedValue = object[key] ? object[key].toString() : '';
                break;
        }

        return dataRowField;
    }

    onSortingChanged(e: ListSearch){
        e.searchString = '';
        this.loadlist(e);
    }

    selectedRowsChanged(selectedRowsCount: number) {
            this.showListActions = selectedRowsCount > 0;
            this.selectedRows = selectedRowsCount;
    }

    loadlist(change: ListSearch = { sortBy: 'Name', isAsc: true, searchString: '', type: this.type, subType: this.subType}) {
        this.initListWithData('get_latest_data'); // Gets data from adal
    }

    refreshButtonClicked(e: IPepButtonClickEvent) {
        this.initListWithData('collect_data'); // Generates updated data
    }

    initListWithData(apiFunc: string) {
        let url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/' + apiFunc;
        this.http.getPapiApiCall(encodeURI(url)).subscribe(
            (latest_data_received) => {
                if (latest_data_received) {
                    this.latestData = latest_data_received;

                    // Add the 3 parts of the result to a single array
                    let latest_data_array = this.json2array_2(this.latestData.Setup, 'Setup');
                    latest_data_array.push(...this.json2array_2(this.latestData.Data, 'Data'));
                    latest_data_array.push(...this.json2array_2(this.latestData.Usage, 'Usage'));

                    // Sort array by its 'Data' column
                    latest_data_array.sort((a, b) => (a.Data > b.Data ? 1 : -1));

                    this.latestDataArray = latest_data_array;
                    this.displayedColumns = ['Data', 'Description', 'Size'];
                    this.totalRows = latest_data_array.length;

                    this.weekNumber = latest_data_received.Week;
                    this.lastUpdatedDate = new Date(latest_data_received.Key).toLocaleString();
                }
            },
            (error) => this.openErrorDialog(error),
            () => {}
        );
    }

    json2array_2(json, prefix: string){
        return Object.keys(json).map(key => {
            const res = {Data:"", Description:"", Size:0, Prefix:""};
            res.Data = key; 
            res.Description = key + "Description"; 
            res.Size = json[key];
            res.Prefix = prefix;
            return res;
        });
    }

    async onLeftMenuClicked() {
    }

    async onRightMenuClicked() {
    }

    onMenuItemClicked(e: IPepMenuItemClickEvent): void{
        const selectedRows = this.table?.getSelectedItemsData()?.rows;
        const rowData = this.table?.getItemDataByID(selectedRows[0]);
        const dataItem = rowData?.Fields[0]?.Value;

        const menuKey = e?.source?.key;

        switch (menuKey)
        {
            case "ExportToCSV":
                this.openDefaultDialog("Not implemented yet", menuKey);
                break;

            case "Update":
                const prefix = rowData?.Fields[0]?.AdditionalValue;
                const requestKey = prefix + "." + dataItem;
                // localhost:
                //let url = 'http://localhost:4400/api/get_latest_data_for_key?key=' + requestKey;
                //this.http.getHttpCall(encodeURI(url)).subscribe(
                // server:
                let url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/get_latest_data_for_key?key=' + requestKey;
                this.http.getPapiApiCall(encodeURI(url)).subscribe(
                    (latest_data_received) => {
                        if (latest_data_received) {
                            // Should return one object with date:value
                            // Put the received value in the table instead of the current size.

                            // First find the correct entry in the datasource.
                            const index = this.latestDataArray.findIndex((element) => (element.Data == dataItem && element.Prefix == prefix));

                            // Infer the received value from server
                            const receivedSize = Object.values(latest_data_received)[0];

                            var clonedArray = JSON.parse(JSON.stringify(this.latestDataArray));
                            clonedArray[index].Size = receivedSize;
                            this.latestDataArray = clonedArray;
                        }
                    },
                    (error) => this.openErrorDialog(error),
                    () => {}
                );

                break;

            default:
                //alert(`Menu option ${key} not implemented yet`);
                this.openDefaultDialog("Not implemented yet", menuKey + ' ' + dataItem);
        }
    }

    openAddonInDialog(remoteModule: RemoteModuleOptions): void {
        remoteModule.remoteEntry = this.addonBaseURL ? `${this.addonBaseURL+remoteModule.remoteName}.js` : remoteModule.remoteEntry;
        const config = this.dialogService.getDialogConfig({}, 'inline');
        this.dialogAddon = remoteModule;
        this.dialogRef = this.dialogService
          .openDialog(this.dialogTemplate, {addon: remoteModule}, config)
            .afterOpened().subscribe((res) => {});
    }

    closeDialog(e = null){
        this.dialogService['dialog'].closeAll();
    }

    onAddonChange(e: { closeDialog: any; }){
        if (e.closeDialog){
            this.closeDialog();
        }
    }

    async getMenu(addonUUID: any): Promise<PepMenuItem[]> {
        const apiNames: Array<PepMenuItem> = [];
        //const body = { RelationName: `${relationTypesEnum[this.type]}TypeListMenu`};
        // debug locally
        //  const menuEntries = await this.http.postHttpCall('http://localhost:4500/api/relations', body).toPromise().then(tabs => tabs.sort((x,y) => x.index - y.index));
        //const menuEntries = await this.http.postPapiApiCall(`/addons/api/${addonUUID}/api/relations`, body).toPromise().then(tabs => tabs.sort((x,y) => x.index - y.index));
        //menuEntries.forEach(menuEntry => apiNames.push(new PepMenuItem({ key: JSON.stringify(menuEntry), text: menuEntry.title})));
        apiNames.push(new PepMenuItem({ key: "MoreInfo", text: "More Info"}))
        apiNames.push(new PepMenuItem({ key: "Update", text: "Update"}))
        return apiNames;
    }

    getRightMenu() : PepMenuItem[] {
        const apiNames: Array<PepMenuItem> = [];
        apiNames.push(new PepMenuItem({ key: "ExportToCSV", text: "Export to CSV"}));
        return apiNames;
    }

    openErrorDialog(error: { fault: { faultstring: any; }; }){
        const title = this.translate.instant('MESSAGES.TITLE_NOTICE');
        const data = new PepDialogData({
            title,
            content: error?.fault?.faultstring || error
        });
        this.dialogService.openDefaultDialog(data);
    }

    openDefaultDialog(title: string, content: string) {
        const data = new PepDialogData({
            title,
            content: content
        });
        this.dialogService.openDefaultDialog(data);
    }
}
