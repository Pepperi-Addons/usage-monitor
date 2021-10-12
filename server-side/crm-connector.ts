import fetch from "node-fetch";
class CrmConnector
{
    tenantId: string;
    clientId: string;
    clientSecret: string;
    resource: string | number | boolean;
    grantType: string;
    token: any;

	constructor(clientSecret: string) {
		this.tenantId = "2f2b54b7-0141-4ba7-8fcd-ab7d17a60547"; //Tenant ID
		this.clientId = "d55d9a33-6186-4e8e-b557-1f46fa2cfe09";  //Application ID
		this.clientSecret = clientSecret; //Secret Key
		//this.resource = "https://org.crm.dynamics.com"; //Crm url
		this.resource = "https://wrntyltd.crm4.dynamics.com"; ; //Crm url
		this.grantType = "client_credentials";
		this.token = null;
	}

	getAuthToken = async () => {
		let response = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': "application/x-www-form-urlencoded",
			},
			body: `reource=${encodeURIComponent(this.resource)}&client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=${this.grantType}&client_info=1&scope=${this.resource}/.default`,
		})
		let data =  await response.json()
		return data.access_token;
	}
	
	authorize = async () => {
		const token = await this.getAuthToken();
		this.token = token;
		return this.token;
	}
	
	getRecords = async (collectionName, params) => {
		let url = `${this.resource}/api/data/v9.0/${collectionName}${params}`;
		const response = await fetch(url, {
			method: 'GET',
			mode: 'cors',
			cache: 'no-cache',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'OData-MaxVersion': '4.0',
				'OData-Version': '4.0',
				'Authorization': `Bearer ${this.token}`
			},
		});
		return await response.json();
	}

	createRecord = async (collectionName, object) => {
		let url = `${this.resource}/api/data/v9.0/${collectionName}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'OData-MaxVersion': '4.0',
				'OData-Version': '4.0',
				'Authorization': `Bearer ${this.token}`
			},
			body: JSON.stringify(object),
		});
		let uri = response.headers.get("OData-EntityId");
        if (uri !== null)
        {
            let regExp = /\(([^)]+)\)/;
		    let matches = regExp.exec(uri);

            if (matches !== null)
            {
		        let newEntityId = matches[1];
		        return newEntityId; 
            }
        }

        return null;
	}
}

//async function CreatePepperiUsage(inputObject: { Setup: { LicensedUsers: null; ActualUsers: number; Accounts: number; Items: number; Catalogs: number; Contacts: number; Buyers: number; Profiles: number; TransactionTypes: number; ActivityTypes: number; AccountTypes: number; TransactionFields: number; ActivityFields: number; TransactionLineFields: number; ItemFields: number; AccountFields: number; UserDefinedTables: number; SecurityGroups: null; }; Usage: { WorkingUsers: number; WorkingBuyers: number; }; Data: { NucleusTransactions: number; NucleusActivities: number; NucleusTransactionLines: number; DatabaseAllActivities: null; Images: number; UserDefinedTablesLines: number; Attachments: null; }; Errors: never[]; Key: string; ExpirationDateTime: string; Year: number; Week: number; DistributorUUID: string; DistributorInternalID: number; }) {
export async function createPepperiUsage(clientSecret: string, inputObject: {}) {
	let new_pepperiusage = {"new_name": new Date().toISOString(), "new_json": JSON.stringify(inputObject)}

	let crmConnector = new CrmConnector(clientSecret);
	await crmConnector.authorize();
	
	var recordid = await crmConnector.createRecord("new_pepperiusages", new_pepperiusage);
	console.log(`Record created with id: ${recordid}`);

	var lastRecord = await crmConnector.getRecords("new_pepperiusages", "?$top=1&$orderby=createdon desc");
	console.log(`Last record created: ${JSON.stringify(lastRecord)}`);

	return {
		RecordID: recordid
		// Removed per Ido's request: LastRecord: lastRecord
	}
}

// let inputObject1 = {
//     "Setup": {
//         "LicensedUsers": null,
//         "ActualUsers": 51,
//         "Accounts": 93,
//         "Items": 50768,
//         "Catalogs": 8,
//         "Contacts": 225,
//         "Buyers": 2,
//         "Profiles": 5,
//         "TransactionTypes": 74,
//         "ActivityTypes": 9,
//         "AccountTypes": 4,
//         "TransactionFields": 110,
//         "ActivityFields": 66,
//         "TransactionLineFields": 68,
//         "ItemFields": 73,
//         "AccountFields": 77,
//         "UserDefinedTables": 29,
//         "SecurityGroups": null
//     },
//     "Usage": {
//         "WorkingUsers": 2,
//         "WorkingBuyers": 0
//     },
//     "Data": {
//         "NucleusTransactions": 598,
//         "NucleusActivities": 217,
//         "NucleusTransactionLines": 745,
//         "DatabaseAllActivities": null,
//         "Images": 46,
//         "UserDefinedTablesLines": 100932,
//         "Attachments": null
//     },
//     "Errors": [],
//     "Key": "2021-06-29T09:08:09.106Z",
//     "ExpirationDateTime": "2023-06-29T09:08:09.106Z",
//     "Year": 2021,
//     "Week": 27,
//     "DistributorUUID": "8513b815-4487-4f16-97ef-2062d8dbde34",
//     "DistributorInternalID": 1110703
// }
// CreatePepperiUsage(inputObject1);
