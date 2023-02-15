import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { PepHttpService } from '@pepperi-addons/ngx-lib';
import { Chart, LegendItem, registerables } from "chart.js";
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

      // By default, do not show legend. Show it only if data is reduced.
      let legend = {
        display: false
      }

      // Get all values, reduced or not, and set legend accordingly.
      let chartDataset = this.chartDataset(legend);

      const dataItemChart = new Chart(this.ctxDataItemChart, {
          type: 'line',
          data: {
              labels: this.chartDataLabels(),
              datasets: [{
                  label: this.dataItemFormattedValue,
                  data: chartDataset,
                  borderColor: "#3e95cd",
                  tension: 0,
                  cubicInterpolationMode: 'monotone',
                  fill: false
              }]
          },
          options: {
            animation: {
              duration: 0 // general animation time
            },
            elements: {
              line: {
                  tension: 0 // disables bezier curves
              }
            },
            responsive: true,
            plugins: {
              legend: legend
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

  chartDataset(legend) {
    
    // See if any values are larger than 1000000 (causing poor performance by charts.js) and reduce size, set matching legend.
    let reduceSizeFactor: any = 1.0;

    // Iterate over all values, stop at first one which is large
    for (let i = 0; i < this.chartData.length && reduceSizeFactor == 1.0; i++)
    {
      let val: any = Object.values(this.chartData[i])[0];
      if (val > 1000000) {
        reduceSizeFactor = 1000.0;
      }
    }
    
    // Set legend if need be
    if (reduceSizeFactor > 1.0) {
      legend.display = true;
      legend.labels = {
        generateLabels: function(chart) {
          const legendItem: LegendItem = {
            text: 'x1000',
            datasetIndex: 0,
            fillStyle: 'transparent',
            lineWidth: 0
          };
          return [legendItem];
        }
      }
    }

    // Return all values, according to size factor
    return this.chartData.map(x => Number(Object.values(x)[0]) / reduceSizeFactor);
  }

  closeDialog(data: any = null): void {
    this.dialogRef.close({data});
  }
}
