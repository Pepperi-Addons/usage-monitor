import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'addon-add-type-dialog',
  templateUrl: './add-type-dialog.component.html',
  styleUrls: ['./add-type-dialog.component.scss']
})
export class AddTypeDialogComponent implements OnInit {

  atdName = '';
  atdDescription = '';
  constructor(
      public translate: TranslateService,
      private dialogRef: MatDialogRef<AddTypeDialogComponent>,
      @Inject(MAT_DIALOG_DATA) public data: any
    ) {
     }

  ngOnInit(): void {
  }

  closeDialog(data: any = null): void {
    this.dialogRef.close({data});
}
}
