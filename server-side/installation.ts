
/*
The return object format MUST contain the field 'success':
{success:true}

If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { PapiClient, CodeJob, AddonDataScheme } from "@pepperi-addons/papi-sdk";
import { Client, Request } from '@pepperi-addons/debug-server'

export async function install(client: Client, request: Request): Promise<any> {
    try {
/*         // install PepperiUsageMonitor code job
        let retValUsageMonitor = await InstallUsageMonitor(service);
        successUsageMonitor = retValUsageMonitor.success;
        errorMessage = "UsageMonitor installation failed on: " + retValUsageMonitor.errorMessage;
        if (!successUsageMonitor){
            console.error(errorMessage);
            return retValUsageMonitor;
        }
        console.log('UsageMonitor codejob installed succeeded.'); */

    }
    catch (err) {
        return {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Cannot install pepperi-usage addon. Unknown error occured',
        };
    }
}

export async function uninstall(client: Client, request: Request): Promise<any> {
    try {
        //const responsePepperiUsageMonitorTable = await service.papiClient.post('/addons/data/schemes/PepperiUsageMonitor/purge',null, headersADAL);
        return {
            success:true,
            errorMessage:'',
            resultObject:{}
        };
    }
    catch (err) {
        return {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Failed to uninstall pepperi-usage addon',
            resultObject: {}
        };
    }
}

export async function upgrade(client: Client, request: Request): Promise<any> {
    return {success:true,resultObject:{}}
}

export async function downgrade(client: Client, request: Request): Promise<any> {
    return {success:true,resultObject:{}}
}

export const PepperiUsageMonitorTable: AddonDataScheme = {
    Name: "PepperiUsageMonitor",
    Type: "data"
}

async function InstallUsageMonitor(service){
    let retVal={
        success: true,
        errorMessage: ''
    };

    try {
        // Install scheme for Pepperi Usage Monitor
        try {
            await service.papiClient.addons.data.schemes.post(PepperiUsageMonitorTable);
            console.log('PepperiUsageMonitor Table installed successfully.');
        }
        catch (err) {
            retVal = {
                success: false,
                errorMessage: ('message' in err) ? err.message : 'Could not install HealthMonitorAddon. Create PepperiUsageMonitor table failed.',
            }
        }

        // Install code job for Pepperi Usage Monitor
        try {
            const codeJob = await service.papiClient.codeJobs.upsert({
                CodeJobName: "Pepperi Usage Monitor Addon Code Job",
                Description: "Pepperi Usage Monitor",
                Type: "AddonJob",
                IsScheduled: true,
                CronExpression: getCronExpression(),
                AddonPath: "api-success-monitor",
                FunctionName: "run_collect_data",
                AddonUUID: service.client.AddonUUID,
                NumberOfTries: 30,
            });
            retVal["codeJobName"] = 'UsageMonitorCodeJobUUID';
            retVal["codeJobUUID"] = codeJob.UUID;
            console.log('PepperiUsageMonitor code job installed successfully.');
        }
        catch (err)
        {
            retVal = {
                success: false,
                errorMessage: ('message' in err) ? err.message : 'Could not install HealthMonitorAddon. Create PepperiUsageMonitor code job failed.',
            }
        }
    }
    catch (err) {
        retVal = {
            success: false,
            errorMessage: ('message' in err) ? err.message : 'Cannot install HealthMonitorAddon (PepperiUsageMonitor). Unknown Error Occured',
        };
    }
    return retVal;
}

function getCronExpression() {
    let expressions = [
        '0 19 * * FRI',
        '0 20 * * FRI',
        '0 21 * * FRI',
        '0 22 * * FRI',
        '0 23 * * FRI',
        '0 0 * * SAT',
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
        '0 22 * * SAT',
        '0 23 * * SAT',
        '0 0 * * SUN',
        '0 1 * * SUN',
        '0 2 * * SUN',
        '0 3 * * SUN',
        '0 4 * * SUN',        
    ]
    const index = Math.floor(Math.random() * expressions.length);
    return expressions[index];
}