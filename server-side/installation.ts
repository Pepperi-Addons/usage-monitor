
/*
The return object format MUST contain the field 'success':
{success:true}

If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/
import { PapiClient, CodeJob, AddonDataScheme, Relation } from "@pepperi-addons/papi-sdk";
import { Client, Request } from '@pepperi-addons/debug-server'
import MyService from './my.service';
import Semver from "semver";
import jwtDecode from "jwt-decode";

export async function install(client: Client, request: Request): Promise<any> {
    try {
        let successUsageMonitor = true;
        let errorMessage = '';
        
        const service = new MyService(client);

        // install UsageMonitor code job
        let retValUsageMonitor = await InstallUsageMonitor(service, client);
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
                errorMessage: ('message' in err) ? err.message : 'Could not install pepperi-usage and pepperi-daily. Settings and Daily table creation failed.',
            }
        }

        const data = {};
        const distributor = await service.GetDistributor(service.papiClient);
        data["Name"] = distributor.Name;
        data[retValUsageMonitor["codeJobName"]] = retValUsageMonitor["codeJobUUID"];

        const usageCodeJob = await service.papiClient.codeJobs.uuid(data[retValUsageMonitor["codeJobName"]]).get();

        //creating daily usage table
        UsageMonitorDailyTable(service);

        //creating a daily code job
        let dailyRetValUsageMonitor = await UpsertDailyCodeJob(service, usageCodeJob);
        if (!dailyRetValUsageMonitor.success) {
            console.error("pepperi-usage-daily installation failed on: " + dailyRetValUsageMonitor.errorMessage);
            return dailyRetValUsageMonitor;
        }
        console.log('Pepperi Usage addon table and code job installation succeeded.');

        data[dailyRetValUsageMonitor["dailyCodeJobName"]] = dailyRetValUsageMonitor["dailyCodeJobUUID"];

        // Add code job info to settings table.
        const settingsBodyADAL= {
            Key: distributor.InternalID.toString(),
            Data: data
        };

        console.log(`About to add data to settings table ${UsageMonitorSettings.Name}...`);
        const settingsResponse = await service.papiClient.addons.data.uuid(client.AddonUUID).table('UsageMonitorSettings').upsert(settingsBodyADAL);

        //creating a relation with DIMX
        DIMXRelation(client);

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

        // unschedule DailyUsageMonitor
        console.log("About to remove code job Pepperi daily Usage Monitor...");
        let DailyUsageMonitorCodeJobUUID = monitorSettings.DailyUsageMonitorCodeJobUUID;
        if(DailyUsageMonitorCodeJobUUID != '') {
            await service.papiClient.codeJobs.upsert({
                UUID: DailyUsageMonitorCodeJobUUID,
                CodeJobName: "Pepperi Daily Usage Monitor",
                IsScheduled: false,
                CodeJobIsHidden:true
            });
        }
        console.log('pepperi-daily-usage codejob unschedule succeeded.');

        // purge ADAL tables
        var headersADAL = {
            "X-Pepperi-OwnerID": client.AddonUUID,
           "X-Pepperi-SecretKey": client.AddonSecretKey
        }

        console.log("About to purge tables UsageMonitor and UsageMonitorSettings...")
        const responseUsageMonitorTable = await service.papiClient.post('/addons/data/schemes/UsageMonitor/purge', null, headersADAL);
        const responseSettingsTable = await service.papiClient.post('/addons/data/schemes/UsageMonitorSettings/purge', null, headersADAL);
        const responseDailyUsageMonitorTable = await service.papiClient.post('/addons/data/schemes/UsageMonitorDaily/purge', null, headersADAL);

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

        //If DIMX relation doesn`t exist, create the relation
        const dimxUrl = `/addons/data/relations?where=RelationName='DataExportResource'`;
        let getDIMXRelationData = await service.papiClient.get(dimxUrl);

        if(getDIMXRelationData.length == 0){
            DIMXRelation(client);
        }
        
        console.log("About to get settings data...")
        const distributor = await service.GetDistributor(service.papiClient);
        const settingsData = await service.papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorSettings.Name).key(distributor.InternalID.toString()).get();
        const codeJobUUID = settingsData.Data.UsageMonitorCodeJobUUID;
        const DailyUsageMonitorCodeJobUUID = settingsData.Data.DailyUsageMonitorCodeJobUUID;
        console.log(`Got code job UUID ${codeJobUUID}`);

        //If daily usage table does not exist, create a new table.
        if(Semver.lte(request.body.FromVersion, '1.0.95')){
            console.log("About to create new daily table");
            UsageMonitorDailyTable(service);
        }

        //creating code job for daily usage
        const usageCodeJob = await service.papiClient.codeJobs.uuid(codeJobUUID).get();

        if(DailyUsageMonitorCodeJobUUID == undefined) {
            console.log("About to create new code job");
            let retVal = await UpsertDailyCodeJob(service, usageCodeJob);
            settingsData.Data.DailyUsageMonitorCodeJobUUID = retVal["dailyCodeJobUUID"];

            console.log(`About to add data to settings table ${UsageMonitorSettings.Name}...`);
            const settingsResponse = await service.papiClient.addons.data.uuid(client.AddonUUID).table('UsageMonitorSettings').upsert(settingsData);
        }
        
        console.log(`Current Addon version is ${request.body.FromVersion}`);
        if(Semver.lte(request.body.FromVersion, '1.0.59')){
            try{
                await DeleteOldCodeJobs(service, client);
            }
            catch(err){
                console.log("Failed to DeleteOldCodeJobs, continue. error = " + (err as {message:string}).message);
            }
        }
        // Update code job to 10 retries instead of 30
        if (Semver.lte(request.body.FromVersion, '1.0.58')) {
            
            console.log(`About to post code job again with 10 retries instead of 30 and also change its schedule to run only on Saturdays...`);

            const codeJob = await service.papiClient.codeJobs.upsert({
                UUID: codeJobUUID,
                CodeJobName: "Pepperi Usage Monitor",
                NumberOfTries: 10,
                CronExpression: getWeeklyCronExpression(client.OAuthAccessToken)
            });

            console.log("Successfully updated code job.")
            console.log("Successfully upgraded addon to new version.")
        }

        // Update code job to work on a different scheduling
        if(Semver.lte(request.body.FromVersion, '1.0.95')){
            console.log(`About to post code job again with a different scheduling- run between 21:00- 02:00...`);

            const codeJob = await service.papiClient.codeJobs.upsert({
                UUID: codeJobUUID,
                CodeJobName: "Pepperi Usage Monitor",
                CronExpression: getWeeklyCronExpression(client.OAuthAccessToken)
            });

            console.log("Successfully updated code job.");
            console.log("Successfully upgraded addon to new version.");
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

const UsageMonitorDaily:AddonDataScheme = {
    Name: 'UsageMonitorDaily',
    Type: 'indexed_data',
    Fields: {
        UUID:{
            Type:'String'
        },
        AddonUUID_RelationName:{
            Type: 'String',
            Indexed: true
        },        
        RelationData:{
            Type:'String'
        }
        
    } as any
}

const UsageMonitorSettings:AddonDataScheme = {
    Name: 'UsageMonitorSettings',
    Type: 'meta_data'
};

export const UsageMonitorTable:AddonDataScheme = {
    Name: "UsageMonitor",
    Type: "data"
}

//creates a relation to DIMX
async function DIMXRelation(client: Client){
    const service = new MyService(client);
    const papiClient = service.papiClient;

    let addonUUID = client.AddonUUID;
    let relation: Relation = {
        "RelationName": "DataExportResource",
        "AddonUUID": addonUUID,
        "Name": "UsageMonitor",
        "Type": "AddonAPI",
        "AddonRelativeURL": "/api/buildObjectsForDIMX"
    }

    try{
        await papiClient.addons.data.relations.upsert(relation);
    }
    catch(ex){
        console.log(`upsertRelation: ${ex}`);
        throw new Error((ex as {message:string}).message);
    }
}


async function UsageMonitorDailyTable(service) {
    //creating daily usage table
    try {
        console.log(`About to create table ${UsageMonitorDaily.Name}...`);
        await service.papiClient.addons.data.schemes.post(UsageMonitorDaily);
        console.log(`Table ${UsageMonitorDaily.Name} created successfully.`);
    }
    catch (err) {
        console.log("error"+err);
    }
}

async function UpsertDailyCodeJob(service, usageCodeJob){
    let retVal = {
        success: true,
        errorMessage: ''
    };

    try {
        if (retVal.success)
        {
            try {
                //creating daily codeJob
                console.log("About to create daily code job Pepperi Usage Monitor...");
                const DailyCodeJob = await service.papiClient.codeJobs.upsert({
                    CodeJobName: "Pepperi Daily Usage Monitor",
                    Description: "Pepperi Daily Usage Monitor",
                    Type: "AddonJob",
                    IsScheduled: true,
                    CronExpression: GetDailyAddonUsageCronExpression(usageCodeJob),
                    AddonPath: "api",
                    FunctionName: "get_relations_daily_data_and_send_errors",
                    AddonUUID: service.client.AddonUUID,
                    NumberOfTries: 3,
                });
                console.log("Code job Pepperi Usage Monitor created successfully.");
                retVal["dailyCodeJobName"] = 'DailyUsageMonitorCodeJobUUID';
                retVal["dailyCodeJobUUID"] = DailyCodeJob.UUID;

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

async function InstallUsageMonitor(service, client){
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
                    CronExpression: getWeeklyCronExpression(client.OAuthAccessToken),
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

function GetDailyAddonUsageCronExpression(usageCodeJob) {
    let cronExp = usageCodeJob['CronExpression'];
    let cronValues = cronExp?.split(' ');
    let getCronHour = cronValues[1];
    let getCronMinutes: string = cronValues[0];
    let getCronDayAndMonth: string = cronValues[2]+' '+cronValues[3]+' *'; 

    let setHour: any= getCronHour-1;
    let setCronExpression: string;
    
    //If setHour is after 23:00, set the hour to 23:00
    if((setHour > 23) || (setHour < 3)){
        setCronExpression = '00 23 * * *'
        return setCronExpression;
    }
    setCronExpression = getCronMinutes + ' ' + setHour + ' ' + getCronDayAndMonth;
    return setCronExpression;
}
/*
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
*/

function getWeeklyCronExpression(token) {
    const rand = (jwtDecode(token)['pepperi.distributorid']) % 59;
    let expressions = [
        rand + "-59/60 21 * * SAT",
        rand + "-59/60 22 * * SAT",
        rand + "-59/60 23 * * SAT",
        rand + "-59/60 0 * * SUN",
        rand + "-59/60 1 * * SUN" ,
        rand + "-59/60 2 * * SUN" 
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
