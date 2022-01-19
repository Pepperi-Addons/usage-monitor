
/*
The return object format MUST contain the field 'success':
{success:true}

If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { PapiClient, CodeJob, AddonDataScheme } from "@pepperi-addons/papi-sdk";
import { Client, Request } from '@pepperi-addons/debug-server'
import MyService from './my.service';

export async function install(client: Client, request: Request): Promise<any> {
    try {
        let successUsageMonitor = true;
        let errorMessage = '';
        
        const service = new MyService(client);

        // install UsageMonitor code job
        let retValUsageMonitor = await InstallUsageMonitor(service);
        if (!retValUsageMonitor.success) {
            console.error("pepperi-usage installation failed on: " + retValUsageMonitor.errorMessage);
            return retValUsageMonitor;
        }
        console.log('Pepperi Usage addon table and code job installation succeeded.');

        // Install scheme for Pepperi Usage Monitor settings
        try {
            console.log(`About to create settings table ${UsageMonitorSettings.Name}...`)
            const UsageMonitorSettingsResponse = await service.papiClient.addons.data.schemes.post(UsageMonitorSettings);            
            console.log('Settings table installed successfully.');
        }
        catch (err) {
            if (err instanceof Error)
            return {
                success: false,
                errorMessage: ('message' in err) ? err.message : 'Could not install pepperi-usage. Settings table creation failed.',
            }
        }

        const data = {};
        const distributor = await service.GetDistributor(service.papiClient);
        data["Name"] = distributor.Name;
        data[retValUsageMonitor["codeJobName"]] = retValUsageMonitor["codeJobUUID"];

        // Add code job info to settings table.
        const settingsBodyADAL= {
            Key: distributor.InternalID.toString(),
            Data: data
        };

        console.log(`About to add data to settings table ${UsageMonitorSettings.Name}...`);
        const settingsResponse = await service.papiClient.addons.data.uuid(client.AddonUUID).table('UsageMonitorSettings').upsert(settingsBodyADAL);

        console.log('Pepperi Usage addon installation succeeded.');
        return {
            success: true,
            errorMessage: ''
        };  
    }
    catch (err) {
        if (err instanceof Error)
        return {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Cannot install pepperi-usage addon. Unknown error occured',
        };
    }
}

export async function uninstall(client: Client, request: Request): Promise<any> {
    try {
        const service = new MyService(client);
        const monitorSettings = await service.getMonitorSettings();

        // unschedule UsageMonitor
        console.log("About to remove code job Pepperi Usage Monitor...");
        let UsageMonitorCodeJobUUID = monitorSettings.UsageMonitorCodeJobUUID;
        if(UsageMonitorCodeJobUUID != '') {
            await service.papiClient.codeJobs.upsert({
                UUID:UsageMonitorCodeJobUUID,
                CodeJobName: "Pepperi Usage Monitor",
                IsScheduled: false,
                CodeJobIsHidden:true
            });
        }
        console.log('pepperi-usage codejob unschedule succeeded.');

        // purge ADAL tables
        var headersADAL = {
            "X-Pepperi-OwnerID": client.AddonUUID,
           "X-Pepperi-SecretKey": client.AddonSecretKey
        }

        console.log("About to purge tables UsageMonitor and UsageMonitorSettings...")
        const responseUsageMonitorTable = await service.papiClient.post('/addons/data/schemes/UsageMonitor/purge', null, headersADAL);
        const responseSettingsTable = await service.papiClient.post('/addons/data/schemes/UsageMonitorSettings/purge', null, headersADAL);

        console.log('pepperi-usage uninstallation succeeded.');

        return {
            success:true,
            errorMessage:'',
            resultObject:{}
        };
    }
    catch (err) {
        if (err instanceof Error)
        return {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Failed to uninstall pepperi-usage addon',
            resultObject: {}
        };
    }
}

export async function upgrade(client: Client, request: Request): Promise<any> {
    try {
        const service = new MyService(client);
        try{
            await DeleteOldCodeJobs(service, client);
        }
        catch(err){
            console.log("Failed to DeleteOldCodeJobs, continue. error = " + (err as {message:string}).message);
        }
        console.log("About to get addon version...")
        let addon = await service.papiClient.addons.installedAddons.addonUUID(client.AddonUUID).get();
        const version = addon?.Version?.split('.').map(item => {return Number(item)}) || [];
        console.log(`Addon version is ${addon?.Version}`);
        
        // Update code job to 10 retries instead of 30
        if (version.length==3 && version[2] <= 58) {
            console.log("About to get settings data...")
            const distributor = await service.GetDistributor(service.papiClient);
            const settingsData = await service.papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorSettings.Name).key(distributor.InternalID.toString()).get();
            const codeJobUUID = settingsData.Data.UsageMonitorCodeJobUUID;
            console.log(`Got code job UUID ${codeJobUUID}, about to post it again with 10 retries instead of 30 and also change its schedule to run only on Saturdays...`);

            const codeJob = await service.papiClient.codeJobs.upsert({
                UUID: codeJobUUID,
                CodeJobName: "Pepperi Usage Monitor",
                NumberOfTries: 10,
                CronExpression: getCronExpression()
            });

            console.log("Successfully updated code job.")
            console.log("Successfully upgraded addon to new version.")
        }
    }
    catch (err)
    {
        if (err instanceof Error)
        return {
            success: true, // No need to fail upgrade
            errorMessage: ('message' in err) ? err.message : 'Failed to upgrade pepperi-usage addon',
            resultObject: {}
        };
    }

    return {success:true,resultObject:{}}
}

export async function downgrade(client: Client, request: Request): Promise<any> {
    return {success:true,resultObject:{}}
}

const UsageMonitorSettings:AddonDataScheme = {
    Name: 'UsageMonitorSettings',
    Type: 'meta_data'
};

export const UsageMonitorTable:AddonDataScheme = {
    Name: "UsageMonitor",
    Type: "data"
}

async function InstallUsageMonitor(service){
    let retVal = {
        success: true,
        errorMessage: ''
    };

    try {
        // Install scheme for Pepperi Usage Monitor
        try {
            console.log(`About to create table ${UsageMonitorTable.Name}...`);
            await service.papiClient.addons.data.schemes.post(UsageMonitorTable);
            console.log(`Table ${UsageMonitorTable.Name} created successfully.`);
        }
        catch (err) {
            if (err instanceof Error)
            retVal = {
                success: false,
                errorMessage: ('message' in err) ? err.message : 'Could not install pepperi-usage. Table creation failed.',
            }
        }

        if (retVal.success)
        {
            // Install code job for Pepperi Usage Monitor
            try {
                console.log("About to create code job Pepperi Usage Monitor...");
                const codeJob = await service.papiClient.codeJobs.upsert({
                    CodeJobName: "Pepperi Usage Monitor",
                    Description: "Pepperi Usage Monitor",
                    Type: "AddonJob",
                    IsScheduled: true,
                    CronExpression: getCronExpression(),
                    AddonPath: "api",
                    FunctionName: "run_collect_data",
                    AddonUUID: service.client.AddonUUID,
                    NumberOfTries: 10,
                });
                console.log("Code job Pepperi Usage Monitor created successfully.");

                retVal["codeJobName"] = 'UsageMonitorCodeJobUUID';
                retVal["codeJobUUID"] = codeJob.UUID;
            }
            catch (err)
            {
                if (err instanceof Error)
                retVal = {
                    success: false,
                    errorMessage: ('message' in err) ? err.message : 'Could not install pepperi-usage. Code job creation failed.',
                }
            }
        }
    }
    catch (err) {
        if (err instanceof Error)
        retVal = {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Cannot install pepperi-usage. Unknown error occured',
        };
    }

    return retVal;
}

function getCronExpression() {
    let expressions = [
        '0 1 * * SAT',
        '0 2 * * SAT',
        '0 3 * * SAT',
        '0 4 * * SAT',
        '0 5 * * SAT',
        '0 6 * * SAT',
        '0 7 * * SAT',
        '0 8 * * SAT',
        '0 9 * * SAT',
        '0 10 * * SAT',
        '0 11 * * SAT',
        '0 12 * * SAT',
        '0 13 * * SAT',
        '0 14 * * SAT',
        '0 15 * * SAT',
        '0 16 * * SAT',
        '0 17 * * SAT',
        '0 18 * * SAT',
        '0 19 * * SAT',
        '0 20 * * SAT',
        '0 21 * * SAT',
        '0 22 * * SAT'      
    ]
    const index = Math.floor(Math.random() * expressions.length);
    return expressions[index];
}

// currentCodeJobUUID saved in UsageMonitorSettings table under Data.UsageMonitorCodeJobUUID property, all other codejobs need to be deleted
async function DeleteOldCodeJobs(service: MyService, client: Client){
    console.log("About to get settings data...")
    const distributor = await service.GetDistributor(service.papiClient);
    const settingsData = await service.papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorSettings.Name).key(distributor.InternalID.toString()).get();
    const currentCodeJobUUID = settingsData.Data.UsageMonitorCodeJobUUID;
    console.log(`Got current code job UUID ${currentCodeJobUUID}`);

    console.log(`Going to extract old addon code jobs`);
    const allDistCodeJobs = await service.papiClient.codeJobs.iter().toArray();
    let addonCodeJobsUUIDs: Array<any> = [];

    // select WHERE "AddonUUID" = '{client.AddonUUID}' AND "FunctionName" = 'run_collect_data' AND "IsScheduled" = true AND "CodeJobIsHidden" = false AND not current codejob
    for (let i = 0; i < allDistCodeJobs.length; i++) {
        if(allDistCodeJobs[i]['AddonUUID'] != null && allDistCodeJobs[i]['AddonUUID']?.toLowerCase() == client.AddonUUID.toLowerCase() && 
        allDistCodeJobs[i]['FunctionName'] == 'run_collect_data' && allDistCodeJobs[i]['IsScheduled'] == true 
        && allDistCodeJobs[i]['CodeJobIsHidden'] == false && allDistCodeJobs[i]['UUID']?.toLowerCase() != currentCodeJobUUID.toLowerCase()){
            addonCodeJobsUUIDs.push(allDistCodeJobs[i].UUID);
        }
    }
    console.log(`Got ${addonCodeJobsUUIDs.length} old code jobs`);

    // delete codejob
    console.log(`Going to delete ${addonCodeJobsUUIDs.length} old code jobs`);
    for (let i = 0; i < addonCodeJobsUUIDs.length; i++) {
        await service.papiClient.codeJobs.upsert({
            UUID:addonCodeJobsUUIDs[i],
            CodeJobName: "Pepperi Usage Monitor",
            IsScheduled: false,
            CodeJobIsHidden:true
        });
    }
    console.log(`Finish deleting ${addonCodeJobsUUIDs.length} old code jobs`);
}