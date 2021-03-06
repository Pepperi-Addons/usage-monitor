import { PapiClient, InstalledAddon } from '@pepperi-addons/papi-sdk'
import { Client } from '@pepperi-addons/debug-server';
import jwtDecode from "jwt-decode";

class MyService {

    papiClient: PapiClient

    constructor(private client: Client) {
        this.papiClient = new PapiClient({
            baseURL: client.BaseURL,
            token: client.OAuthAccessToken,
            addonUUID: client.AddonUUID,
            addonSecretKey: client.AddonSecretKey,
            actionUUID: client.ActionUUID
        });
    }

    doSomething() {
        console.log("doesn't really do anything....");
    }

    getAddons(): Promise<InstalledAddon[]> {
        return this.papiClient.addons.installedAddons.find({});
    }

    async getMonitorSettings() {
        const distributorID = jwtDecode(this.client.OAuthAccessToken)['pepperi.distributorid'].toString();
        const addonUUID= this.client.AddonUUID;
        const monitorSettings = await this.papiClient.addons.data.uuid(addonUUID).table('UsageMonitorSettings').key(distributorID).get();
        return monitorSettings.Data;
    }

    getExpirationDateTime(){
        // the ExpirationDateTime is 2 years
        let expirationDateTime = new Date(Date.now());
        expirationDateTime.setFullYear(expirationDateTime.getFullYear()+2);
        return expirationDateTime.toISOString();
    }

    getNumberOfWeek() {
        const today: any = new Date();
        const firstDayOfYear: any = new Date(today.getFullYear(), 0, 1);
        const pastDaysOfYear = (today - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    getFullYear() {
        const today: any = new Date();
        return today.getFullYear();
    }

    async GetDistributor(papiClient: PapiClient) {
        let distributorData = await papiClient.get('/distributor');
        const machineData = await papiClient.get('/distributor/machine');
        const distributor ={
            UUID: distributorData.UUID,
            InternalID: distributorData.InternalID,
            Name: distributorData.Name,
            MachineAndPort: machineData.Machine + ":" + machineData.Port,
            MaxEmployees: distributorData.MaxEmployees,
            AccountingStatus: distributorData.AccountingStatus?.Name
        };
        return distributor;
    }

    async getParameter(name: string, withDecryption: boolean = false): Promise<string> {
        var AWS = require('aws-sdk'); // global?

        let ssm = new AWS.SSM();
        let options = {
            Name: name,
            WithDecryption: withDecryption
        };
        let paramValueObject =  await ssm.getParameter(options).promise();
        let paramValue = paramValueObject.Parameter.Value;
        return paramValue;
    }

    /*findFirstOccurrence = (string, searchElements, fromIndex = 0) => {
        let min = string.length;
        for (let i = 0; i < searchElements.length; i += 1) {
          const occ = string.indexOf(searchElements[i], fromIndex);
          if (occ !== -1 && occ < min) {
            min = occ;
          }
        }
        return (min === string.length) ? -1 : min;
      }
      
    functionName = (levelsUp: number = 1, func: any = null) => {
        if (func) {
          if (func.name) {
            return func.name;
          }
          const result = /^function\s+([\w\$]+)\s*\(/.exec(func.toString());
          return result ? result[1] : '';
        }
        const obj:any = {};
        Error.captureStackTrace(obj, this.functionName);
        //const {stack} = obj;
        const stack = obj.stack;
        const newStack = stack.split("\n").slice(levelsUp).join("\n"); 
        const firstCharacter = newStack.indexOf('at ') + 3;
        const lastCharacter = this.findFirstOccurrence(newStack, [' ', ':', '\n'], firstCharacter);
        return newStack.slice(firstCharacter, lastCharacter);
      }*/
}

export default MyService;