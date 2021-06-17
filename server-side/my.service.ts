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
            addonSecretKey: client.AddonSecretKey
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

    async GetDistributor(papiClient){
        let distributorData = await papiClient.get('/distributor');
        const machineData = await papiClient.get('/distributor/machine');
        const distributor ={
            UUID: distributorData.UUID,
            InternalID: distributorData.InternalID,
            Name: distributorData.Name,
            MachineAndPort: machineData.Machine + ":" + machineData.Port
        };
        return distributor;
    }
}

export default MyService;