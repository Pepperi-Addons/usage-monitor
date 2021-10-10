import { ListSearch, RemoteModuleOptions } from './../../../../../model';
import { PepperiTableComponent } from './pepperi-table/pepperi-table.component';
import { ChartDialogComponent } from './chart-dialog/chart-dialog';
import { Component, ComponentRef, Input, OnInit, SimpleChanges, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { PepHttpService, PepSessionService } from '@pepperi-addons/ngx-lib';
import { PepDialogService, PepDialogData } from '@pepperi-addons/ngx-lib/dialog';
import { PepMenuItem, IPepMenuItemClickEvent } from '@pepperi-addons/ngx-lib/menu';
import { PepListActionsComponent } from '@pepperi-addons/ngx-lib/list';
import { PapiClient } from '@pepperi-addons/papi-sdk';
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
    rightMenuItems: Promise<PepMenuItem[]>;
    totalRows = 0;
    displayedColumns: string[];
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

    private listLoaded = false;
    @Input() type: any;
    @Input() ID: any;
    @Input() data: any;
    @Input() relationsData: any;
    
    private _isActive: boolean = false;
    @Input() 
    set isActive(value: boolean) {
        this._isActive = value;

        if (value && !this.listLoaded) {
            //this.loadlist()
            //this.initListWithDataFromParent();
            this.listLoaded = true;
        }
    }
    get isActive(): boolean {
        return this._isActive; 
    }

    addonBaseURL = '';

    constructor(
        private translate: TranslateService,
        private http: PepHttpService,
        private dialogService: PepDialogService,
        private session: PepSessionService,
        private route: ActivatedRoute

    ) {
        this.addonUUID = route.snapshot.params.addon_uuid;
        this.papi = new PapiClient({
            baseURL: this.session.getPapiBaseUrl(),
            token: this.session.getIdpToken()
        });
    }

    async ngOnInit() {
        this.leftMenuItems = this.getLeftMenu();
        this.rightMenuItems = this.getRightMenu();

        this.route.queryParams.subscribe(queryParams => {
            this.addonBaseURL = queryParams?.addon_base_url;
        });

        this.initListWithDataFromParent();
    }

    // List functions
    customizeDataRowField(object: any, key: any, dataRowField: any) {

        switch (key) {
            case 'Data':
                dataRowField.ColumnWidth = 20;
                dataRowField.AdditionalValue = object.Prefix;
                break;
            case 'Description':
                dataRowField.ColumnWidth = 65;
                break;
            case 'Size':
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
    }

    selectedRowsChanged(selectedRowsCount: number) {
            this.showListActions = selectedRowsCount > 0;
            this.selectedRows = selectedRowsCount;
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['data']) {
            //alert(JSON.stringify(changes['data'].currentValue));
            this.initListWithDataFromParent();
        }
        else if (changes['relationsData']) {
            this.initListWithRelationsData();
        }
    }

    initListWithRelationsData() {
        if (this.relationsData) {
            //alert('isActive: ' + this.isActive + ', type: '+this.type+', ID: '+this.ID + ', data: ' + JSON.stringify(this.relationsData));
            //alert('Current tab data: ' + this.relationsData.tab)

            // Copy array from received data to table data.
            let receivedData = JSON.parse(JSON.stringify(Object.values(this.relationsData)[0]));;
            let prefix = Object.keys(this.relationsData)[0];
            receivedData.map(x => x.Prefix = prefix);

            this.latestDataArray = receivedData;
            this.displayedColumns = ['Data', 'Description', 'Size'];
            this.totalRows = this.latestDataArray.length;
        }
    }

    initListWithDataFromParent() {
        if (this.data) {
            let latest_data_array = this.json2array_2(this.data, this.type);

            // Sort array by its 'Data' column
            latest_data_array.sort((a, b) => (a.Data > b.Data ? 1 : -1));

            this.latestDataArray = latest_data_array;
            this.displayedColumns = ['Data', 'Description', 'Size'];
            this.totalRows = latest_data_array.length;
        }
    }

    json2array_2(json, prefix: string){
        let jsonPortion = json[prefix];
        return Object.keys(jsonPortion).map(key => {
            const res = {Data:"", Description:"", Size:0, Prefix:""};
            res.Data = key; 
            let additionalData = jsonPortion[key];
            if (typeof additionalData === 'object' && additionalData !== null) {
                res.Description = additionalData.Description;
                res.Size = additionalData.Size;
            }
            else {
                res.Description = key + "Description"; 
                res.Size = additionalData;
            }
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
        const prefix = rowData?.Fields[0]?.AdditionalValue;
        const requestKey = prefix + "." + dataItem;
        
        switch (menuKey)
        {
            case "ExportToCSV":
                this.openDefaultDialog("Not implemented yet", menuKey);
                break;

            case "UpdateSingleValue":
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
                            clonedArray[index].Size = typeof receivedSize === 'object' && receivedSize !== null ? (receivedSize as any).Size : receivedSize;
                            this.latestDataArray = clonedArray;
                        }
                    },
                    (error) => this.openErrorDialog(error),
                    () => {}
                );

                break;

            case "MoreInfoOpensGraph":
                const dataItemFormattedValue = rowData?.Fields[0]?.FormattedValue;
                const dataItemDescription = rowData?.Fields[1]?.FormattedValue;
                this.openChart(requestKey, dataItemFormattedValue, dataItemDescription);

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

    async getLeftMenu(): Promise<PepMenuItem[]> {
        const apiNames: Array<PepMenuItem> = [];

        this.translate.get('MoreInfoOpensGraph').subscribe((txt: string) => { 
            apiNames.push(new PepMenuItem({key: "MoreInfoOpensGraph", text: txt}))
        });

        this.translate.get('UpdateSingleValue').subscribe((txt: string) => { 
            apiNames.push(new PepMenuItem({key: "UpdateSingleValue", text: txt}));
        });

        return apiNames;
    }

    async getRightMenu() : Promise<PepMenuItem[]> {
        const apiNames: Array<PepMenuItem> = [];
        this.translate.get('ExportToCSV').subscribe((txt: string) => { 
            apiNames.push(new PepMenuItem({key: "ExportToCSV", text: txt}));
        });
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

    openChart(dataItem: string, dataItemFormattedValue: string, dataItemDescription: string) {
        const dialogConfig = this.dialogService.getDialogConfig(
            {}, 'large'
        )
        this.dialogService.openDialog(ChartDialogComponent, 
            {
                dataItem: dataItem, 
                dataItemFormattedValue: dataItemFormattedValue,
                dataItemDescription: dataItemDescription
            },
            dialogConfig
            );
    }
}
