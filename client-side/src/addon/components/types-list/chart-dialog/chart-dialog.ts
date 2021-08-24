import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { PepHttpService } from '@pepperi-addons/ngx-lib';
import { Chart, registerables } from "chart.js";
import 'chartjs-adapter-moment';

@Component({
  selector: 'chart-dialog',
  templateUrl: './chart-dialog.html',
  styleUrls: ['./chart-dialog.scss']
})
export class ChartDialogComponent implements OnInit {

  dataItem: string;
  dataItemFormattedValue: string;
  dataItemDescription: string;
  chartData: any = {};

  ctxDataItemChart: any;
  @ViewChild ('dataItemChart') canvasDataItemChart: ElementRef;
  labels: ["1", "2"];

  constructor(
      public translate: TranslateService,
      private http: PepHttpService,
      private dialogRef: MatDialogRef<ChartDialogComponent>,
      @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.dataItem = data.dataItem;
        this.dataItemFormattedValue = data.dataItemFormattedValue;
        this.dataItemDescription = data.dataItemDescription;
      }

  ngOnInit() {
    Chart.register(...registerables);
    
    const url = '/addons/api/00000000-0000-0000-0000-000000005A9E/api/get_all_data_for_key?key=' + this.dataItem;
    this.http.getPapiApiCall(encodeURI(url)).subscribe(
        (data_received) => {
            if (data_received) {
                // Should return data objects with date:value
                this.chartData = data_received;
                this.loadData();
            }
        },
        (error) => {},
        () => {}
    );
  }

  ngAfterViewInit()	{
    
  }

  loadData() {
      Chart.defaults.maintainAspectRatio = true;
      this.ctxDataItemChart = this.canvasDataItemChart.nativeElement.getContext('2d');
      const dataItemChart = new Chart(this.ctxDataItemChart, {
          type: 'line',
          data: {
              labels: this.chartDataLabels(),
              datasets: [{
                  label: this.dataItemFormattedValue,
                  data: this.chartDataset(),
                  borderColor: "#3e95cd"
              }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                display: false
              }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'week'
                    }
                },
                y: {
                  ticks: {
                    stepSize: 1
                  }
                }
            }
        }
      });
  }

  chartDataLabels() {
    return this.chartData.map(x => Object.keys(x)[0]);
  }

  chartDataset() {
    return this.chartData.map(x => Object.values(x)[0]);
  }

  closeDialog(data: any = null): void {
    this.dialogRef.close({data});
  }
}
