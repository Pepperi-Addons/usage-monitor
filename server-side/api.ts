import MyService from './my.service'
import { Client, Request } from '@pepperi-addons/debug-server'
import { UsageMonitorTable } from './installation'
import { createPepperiUsage } from './crm-connector'
import { get } from 'lodash';

export async function mock_relation()
{
    let randTitle = Math.floor(Math.random() * 100);
    let randResources = Math.floor(Math.random() * 8) + 2; // number of resources (2-10)

    let resources = new Array();
    for (let i = 0; i < randResources; i++) {
        let rand1 = Math.floor(Math.random() * 100);
        let resource = {
            Data: "Amir Random Data " + rand1,
            Description: "Description for Amir Data " + rand1,
            Size: rand1
        };
        resources.push(resource);
    }

    return {
        Title: "Usage Monitor " + randTitle,
        Resources: resources
    }
}

export async function get_relations_data(client: Client) {
    const service = new MyService(client);
    const papiClient = service.papiClient;

    const relations = papiClient.addons.data.relations.iter({where: "RelationName='UsageMonitor'"});

    let relationsDataList: {
        [key: string]: 
            {
                Data: string,
                Description: string,
                Size: number
            }[]        
    }[] = [];

    let arrPromises: Promise<any>[] = [];

    for await (const relation of relations)
    {
        try {
            const url = `/addons/api/${relation.AddonUUID}${relation.AddonRelativeURL?.startsWith('/') ? relation.AddonRelativeURL : '/' + relation.AddonRelativeURL}`;

            // "data" is an object containing a title and a list of objects. 
            // See https://apidesign.pepperi.com/add-ons/addons-link-table/relation-names/usage-monitor
            // Rearrange data from all external sources as a list of objects, each one has the title as key, and list of resources as value.
            arrPromises.push(service.papiClient.get(url).then(data => {

                // Allow multiple relations to reside in the same tab (title)
                let index = relationsDataList.map(x => Object.keys(x)[0]).indexOf(data.Title);
                if (index > -1) {

                    // Add resources to existing one in same tab
                    relationsDataList[index][data.Title] = relationsDataList[index][data.Title].concat(data.Resources);
                }
                else {
                    relationsDataList.push({
                [data.Title]: data.Resources
                })}})
            .catch(error => console.error(`Error getting relation data from addon ${relation.AddonUUID} at url ${url}`)));
        }
        catch (error)
        {
            if (error instanceof Error)
            return {
                success: false,
                errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
            }
        }
    }

    await Promise.all(arrPromises);

    return relationsDataList;
}

async function get_all_data_internal(client: Client) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    // Get all data from table
    const all_data = await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).iter().toArray();

    return all_data;
}

// First try to get value by using direct property reference.
// If not found, try relations data section which has a different structure.
function get_object_value(obj, requestedKey) {
    try {
        let objectValue = get(obj, requestedKey);

        if (objectValue === undefined) {
            // Get tokens of requestedKey.
            const requestedKeyTokens = requestedKey.split('.'); // Should be an array of 2. First one is the key, second is the value of 'Data' in the array of resources under it.

            // requestedKey might be in relations data. It has a different structure (see DataExample.json) so need to iterate the keys.
            const relationsDataArray = obj.RelationsData;

            if (relationsDataArray != null) {

                // Find sub-array which has the requested key (first token)
                const element = relationsDataArray.find((x) => (Object.keys(x)[0] === requestedKeyTokens[0]));

                // If found, find the correct data (second token)
                if (element !== undefined) {
                    const subArray = element[requestedKeyTokens[0]];
                    const resource = subArray.find((x) => (x.Data === requestedKeyTokens[1]));

                    if (resource !== undefined) {
                        objectValue = resource.Size;
                    }
                }
            }
        }

        return objectValue;
    }
    catch (error: any)
    {
        console.log(('message' in error) ? error.message : 'Unknown error occurred, see logs.');
    }

    return null;
}

// Returns a list of one key's values per date, no time limit backwards
// See: DataExample for data object.
// .../get_all_data_for_key?key=Data.NucleusTransactions
export async function get_all_data_for_key(client: Client, request: Request) {
    try {
        const requestedKey: string = request.query.key;

        // Get all data from table
        const all_data = await get_all_data_internal(client);

        // Sort data from oldest to newest
        const sorted_all_data = all_data?.sort((a, b) => 
            (a.ModificationDateTime !== undefined && b.ModificationDateTime !== undefined && a.ModificationDateTime > b.ModificationDateTime) ? 1 : -1);

        // Leave only the creation date and requested key/value from each object in array returned from table.
        const all_data_for_key = sorted_all_data?.map((obj) => {
            let date: string = obj?.Key!.toString();
            return {
                [date]: get_object_value(obj, requestedKey)
            };
        });

        return all_data_for_key;
    }
    catch (error: any)
    {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        } 
    }
}

// Returns one key's latest value and date
// See: DataExample for data object.
// .../get_latest_data_for_key?key=Data.NucleusTransactions
export async function get_latest_data_for_key(client: Client, request: Request) {
    try {
        const requestedKey: string = request.query.key;

        // Get all data from table
        const latest_data = await collect_data(client, request);
        let date: string;
        if (latest_data) {
            date = latest_data?.Key!.toString();
        
            return {
                [date]: get_object_value(latest_data, requestedKey)
            }
        }
    }
    catch (error: any)
    {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        } 
    }
}

// Returns all data sorted oldest to newest
export async function get_all_data(client: Client, request: Request) {
    try {
        // Get latest data from table
        const all_data = await get_all_data_internal(client);

        // Sort data from oldest to newest
        const sorted_all_data = all_data?.sort((a, b) => 
            (a.ModificationDateTime !== undefined && b.ModificationDateTime !== undefined && a.ModificationDateTime > b.ModificationDateTime) ? 1 : -1);
        if (sorted_all_data && sorted_all_data !== undefined)
            return sorted_all_data;
        else
            return null;
    }
    catch (error: any) {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        } 
    }
}

// Returns newest record
export async function get_latest_data(client: Client, request: Request) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    try {

        // Can't get newest record from adal because 'ModificationDateTime' isn't indexed.
        //var latest_data = await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).find(
        //  {order_by:'ModificationDateTime', page_size:1, page:1});

        // Get all data from table
        const all_data = await get_all_data_internal(client);

        // Sort data from newest to oldest in order to return the newest
        var sorted_all_data = all_data?.sort((a, b) => 
            (a.ModificationDateTime !== undefined && b.ModificationDateTime !== undefined && a.ModificationDateTime < b.ModificationDateTime) ? 1 : -1);
        if (sorted_all_data && sorted_all_data !== undefined && sorted_all_data.length > 0)
            return sorted_all_data[0];
        else
            return null;
    }
    catch (error: any) {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        } 
    }
}

// Unused: Function to be run from PNS trigger for every ADAL new record
export async function triggered_by_pns(client: Client, request: Request) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    try {
        request.body.Key = new Date(Date.now()).toISOString();
        await papiClient.addons.data.uuid(client.AddonUUID).table("UsageMonitorDebug").upsert(request.body);
    }
    catch (error: any) {
        const errorObj = {
            Key: new Date(Date.now()).toISOString(),
            Message: error.message
        };
        await papiClient.addons.data.uuid(client.AddonUUID).table("UsageMonitorDebug").upsert(errorObj);
    }
}

// Extracted this to a function because code job isn't authorized to get from parameter store.
// So this function is called over http from within run_collect_data (which is called by a code job). 
export async function push_data_to_crm(client: Client, request: Request) {
    const service = new MyService(client);

    try {
        console.log("About to get CRM credentials from AWS Parameter Store...");
        let clientSecret = await service.getParameter("CRMClientSecret", true);
        console.log("Got CRM credentials, about to send data to CRM...");
        let res_collect_data = request.body;
        const retCRM = await createPepperiUsage(clientSecret, res_collect_data);
        console.log("Data sent to CRM successfully.");

        return {
            success: true,
            CRMResponse: retCRM
        }
    }
    catch (error: any)
    {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        }
    }
}

// Function to be run from Pepperi Usage Monitor Addon Code Job
// Gets the data, inserts to adal table, then to CRM.
export async function run_collect_data(client: Client, request: Request) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    try {
        console.log("About to call collect_data...");

        // Run main data collection function
        const res_collect_data = await collect_data(client, request);

        // Insert data to CRM. 
        // Need to do this synchronously by using http call instead of direct function call (code jobs don't have permission to get parameter from parameter store)
        console.log("About to call function push_data_to_crm over http...");
        let retCRM = await papiClient.addons.api.uuid(client.AddonUUID).file('api').func('push_data_to_crm').post({}, res_collect_data);
        console.log("Response from push_data_to_crm: " + JSON.stringify(retCRM));

        res_collect_data.CRMData = retCRM;

        console.log(`About to add data to table ${UsageMonitorTable.Name}.`);

        // Insert results to ADAL
        await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).upsert(res_collect_data);

        console.log("Data added to table successfully, leaving.");        

        return res_collect_data;
    }
    catch (error: any)
    {
        return {
            success: false,
            errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
        }
    }
}

export async function collect_data(client: Client, request: Request) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    let errors:{object:string, error:string}[] = [];

    let distributorDataUUID: any = null;
    let distributorDataInternalID: any = null;
    let distributorDataName: any = null;
    let distributorDataAccountingStatus: any = null;
    let distributorDataMaxEmployees: any = null;

    console.log("About to send one sync request to make sure nuc is loaded before all other requests are sent.");

    await service.GetDistributor(papiClient)
            .then(x => {
                distributorDataUUID = x.UUID; 
                distributorDataInternalID = x.InternalID;
                distributorDataName = x.Name;
                distributorDataAccountingStatus = x.AccountingStatus;
                distributorDataMaxEmployees = x.MaxEmployees;
            })
            .catch(error => errors.push({object:'DistributorData', error:('message' in error) ? error.message : 'general error'}));

    console.log("About to send async requests for data...");

    //console.log(service.functionName());
    
    let actualUsersCount: any = null;
    let accountsCount: any = null;
    let itemsCount: any = null;
    let catalogsCount: any = null;
    let contactsCount: any = null;
    let buyersObjects: any[] = [];
    let buyersCount: any = null;
    let profilesCount: any = null;
    let transactionTypesCount: any = null;
    let activityTypesCount: any = null;
    let accountTypesCount: any = null;
    let transactionFieldsCount: any = null;
    let activityFieldsCount: any = null;
    let transactionLineFieldsCount: any = null;
    let itemFieldsCount: any = null;
    let accountFieldsCount: any = null;
    let userDefinedTablesCount: any = null;
    let transactionsCount: any = null;
    let activitiesCount: any = null;
    let transactionLinesCount: any = null;
    let imagesCount: any = null;
    let userDefinedTablesLinesCount: any = null;

    // Working users/buyers created at least one new activity in all_activities in the last month.
    let lastMonth = new Date(Date.now());
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthString = lastMonth.toISOString();

    // Hack: shorten ISO format, remove the time. This is b/c papi cannot parse ISO string with decimal point for seconds.
    // See: https://pepperi.atlassian.net/browse/DI-18019
    const lastMonthStringWithoutTime = lastMonthString.split('T')[0] + 'Z';
    const allActivitiesUsersAndBuyersTask = papiClient.allActivities.count({where:"CreationDateTime>'" + lastMonthStringWithoutTime + "'", group_by:"CreatorInternalID"})
        .catch(error => errors.push({object:'AllActivitiesUsersAndBuyers', error:('message' in error) ? error.message : 'general error'}));
    
    let workingUsers = 0;
    let workingBuyers = 0;

    let relationsData: any = null;

    await Promise.all([
        papiClient.users.count({include_deleted:false})
            .then(x => actualUsersCount = x)
            .catch(error => errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'})),
        papiClient.users.count({include_deleted:false})
            .then(x => actualUsersCount = x)
            .catch(error => errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'})),
        papiClient.accounts.count({include_deleted:false})
            .then(x => accountsCount = x)
            .catch(error => errors.push({object:'Accounts', error:('message' in error) ? error.message : 'general error'})),
        papiClient.items.count({include_deleted:false})
            .then(x => itemsCount = x)
            .catch(error => errors.push({object:'Items', error:('message' in error) ? error.message : 'general error'})),
        papiClient.catalogs.count({include_deleted:false})
            .then(x => catalogsCount = x)
            .catch(error => errors.push({object:'Catalogs', error:('message' in error) ? error.message : 'general error'})),
        papiClient.contacts.count({include_deleted:false, where:'IsBuyer=false'})
            .then(x => contactsCount = x)
            .catch(error => errors.push({object:'Contacts', error:('message' in error) ? error.message : 'general error'})),
        papiClient.profiles.count({include_deleted:false})
            .then(x => profilesCount = x)
            .catch(error => errors.push({object:'Profiles', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('transactions').types.get()
            .then(x => transactionTypesCount = x.length)
            .catch(error => errors.push({object:'TransactionTypes', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('activities').types.get()
            .then(x => activityTypesCount = x.length)
            .catch(error => errors.push({object:'ActivityTypes', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('accounts').types.get()
            .then(x => accountTypesCount = x.length)
            .catch(error => errors.push({object:'AccountTypes', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('transactions').fields.get()
            .then(x => transactionFieldsCount = x.length)
            .catch(error => errors.push({object:'TransactionFields', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('activities').fields.get()
            .then(x => activityFieldsCount = x.length)
            .catch(error => errors.push({object:'ActivityFields', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('transaction_lines').fields.get()
            .then(x => transactionLineFieldsCount = x.length)
            .catch(error => errors.push({object:'TransactionLinesFields', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('items').fields.get()
            .then(x => itemFieldsCount = x.length)
            .catch(error => errors.push({object:'ItemFields', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.type('accounts').fields.get()
            .then(x => accountFieldsCount = x.length)
            .catch(error => errors.push({object:'AccountFields', error:('message' in error) ? error.message : 'general error'})),
        papiClient.metaData.userDefinedTables.iter({include_deleted:false}).toArray()
            .then(x => userDefinedTablesCount = x.length)
            .catch(error => errors.push({object:'UserDefinedTables', error:('message' in error) ? error.message : 'general error'})),
        papiClient.transactions.count({include_deleted:false})
            .then(x => transactionsCount = x)
            .catch(error => errors.push({object:'Transactions', error:('message' in error) ? error.message : 'general error'})),
        papiClient.activities.count({include_deleted:false})
            .then(x => activitiesCount = x)
            .catch(error => errors.push({object:'Activities', error:('message' in error) ? error.message : 'general error'})),
        papiClient.transactionLines.count({include_deleted:false})
            .then(x => transactionLinesCount = x)
            .catch(error => errors.push({object:'TransactionLines', error:('message' in error) ? error.message : 'general error'})),
        papiClient.images.count({where:'ImageType=1'})
            .then(x => imagesCount = x)
            .catch(error => errors.push({object:'Images', error:('message' in error) ? error.message : 'general error'})),
        papiClient.userDefinedTables.count({include_deleted:false})
            .then(x => userDefinedTablesLinesCount = x)
            .catch(error => errors.push({object:'UserDefinedTablesLines', error:('message' in error) ? error.message : 'general error'})),
        papiClient.contacts.iter({include_deleted:false, where:'IsBuyer=true', fields:['InternalID']}).toArray()
            .then(async x => {
                buyersObjects = x; 
                buyersCount = x.length;

                // Iterate all working users and buyers, get which ones are buyers (the rest are users).
                try {

                    // The following code dependes on both allActivitiesUsersAndBuyersTask and buyers tasks:
                    const allActivitiesUsersAndBuyers = await allActivitiesUsersAndBuyersTask;

                    // Iterate buyersObject, see which ones appear in allActivitiesUsersAndBuyers to get the number of working buyers (the rest are working users).
                    buyersObjects.forEach(buyerObject => {
                        const buyerInternalID = buyerObject['InternalID'] as number;
                        allActivitiesUsersAndBuyers[buyerInternalID] && allActivitiesUsersAndBuyers[buyerInternalID] > 0 ? workingBuyers++ : null;
                    });

                    workingUsers = Object.keys(allActivitiesUsersAndBuyers).length - workingBuyers;
                }
                catch (error: any) {
                    errors.push({object:'WorkingUsers', error:('message' in error) ? error.message : 'general error'});
                }
            })
            .catch(error => errors.push({object:'Buyers', error:('message' in error) ? error.message : 'general error'})),
        get_relations_data(client)
            .then(x => relationsData = x)
            .catch(error => errors.push({object:'RelationsData', error:('message' in error) ? error.message : 'general error'}))
    ] as Promise<any>[])

    // Result object construction
    const result = {
        Setup: {},
        Usage: {},
        Data: {},
        RelationsData: relationsData,
        Errors: {},
        CRMData: {},
        Key: new Date(Date.now()).toISOString(),
        ExpirationDateTime: service.getExpirationDateTime(),
        Year: service.getFullYear(),
        Week: service.getNumberOfWeek(),
        DistributorUUID: distributorDataUUID,
        DistributorInternalID: distributorDataInternalID,
        distributorName: distributorDataName,
        distributorAccountingStatus: distributorDataAccountingStatus
    };
    result.Setup = {
        Profiles: profilesCount,
        TransactionTypes: transactionTypesCount,
        ActivityTypes: activityTypesCount,
        AccountTypes: accountTypesCount,
        TransactionFields: transactionFieldsCount,
        ActivityFields: activityFieldsCount,
        TransactionLineFields: transactionLineFieldsCount,
        ItemFields: itemFieldsCount,
        AccountFields: accountFieldsCount,
        SecurityGroups: null
    };

    result.Usage = {
        WorkingUsers: workingUsers,
        WorkingBuyers: workingBuyers
    }

    result.Data = {
        Accounts: accountsCount,
        ActualUsers: actualUsersCount, 
        Buyers: buyersCount,
        Catalogs: catalogsCount,
        Contacts: contactsCount,
        Items: itemsCount,
        LicensedUsers: distributorDataMaxEmployees,
        NucleusTransactions: transactionsCount,
        NucleusActivities: activitiesCount,
        NucleusTransactionLines: transactionLinesCount,
        DatabaseAllActivities: null,
        Images: imagesCount,
        UserDefinedTables: userDefinedTablesCount,
        UserDefinedTablesLines: userDefinedTablesLinesCount,
        Attachments: null
    }

    result.Errors = errors;

    console.log("Finished all calls for data, leaving.");
    
    return result;
}