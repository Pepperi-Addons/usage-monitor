import MyService from './my.service'
import { Client, Request } from '@pepperi-addons/debug-server'
import { UsageMonitorTable } from './installation'
import { createPepperiUsage } from './crm-connector'
import { get } from 'lodash';

async function get_all_data_internal(client: Client) {
    const service = new MyService(client);
    let papiClient = service.papiClient;

    // Get all data from table
    const all_data = await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).iter().toArray();

    return all_data;
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
                [date]: get(obj, requestedKey)
            };
        });

        return all_data_for_key;
    }
    catch (error)
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
                [date]: get(latest_data, requestedKey)
            }
        }
    }
    catch (error)
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
    catch (error) {
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
    catch (error) {
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
    catch (error) {
        const errorObj = {
            Key: new Date(Date.now()).toISOString(),
            Message: error.message
        };
        await papiClient.addons.data.uuid(client.AddonUUID).table("UsageMonitorDebug").upsert(errorObj);
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

        try {
            console.log("Call to collect_data ended, about to get CRM credentials from AWS Parameter Store...");
            let clientSecret = await service.getParameter("CRMClientSecret", true);
            console.log("Got CRM credentials, about to send data to CRM...");
            const retCRM = await createPepperiUsage(clientSecret, res_collect_data);
            console.log("Data sent to CRM successfully.");

            res_collect_data.CRMData = retCRM;
        }
        catch (error)
        {
            return {
                success: false,
                errorMessage: ('message' in error) ? error.message : 'Unknown error occurred, see logs.',
            }
        }

        console.log(`About to add data to table ${UsageMonitorTable.Name}.`);

        // Insert results to ADAL
        await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).upsert(res_collect_data);

        console.log("Data added to table successfully, leaving.");        

        return res_collect_data;
    }
    catch (error)
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

    console.log("About to send async requests for data...");

    //console.log(service.functionName());
    
    const usersTask = papiClient.users.count({include_deleted:false});
    const accountsTask = papiClient.accounts.count({include_deleted:false});
    const itemsTask = papiClient.items.count({include_deleted:false});
    const catalogsTask = papiClient.catalogs.count({include_deleted:false});
    const contactsTask = papiClient.contacts.count({include_deleted:false});
    const buyersObjectsTask = papiClient.contacts.iter({include_deleted:false, where:'IsBuyer=true', fields:['InternalID']}).toArray();
    const profilesTask = papiClient.profiles.count({include_deleted:false});
    const transactionTypesTask = papiClient.metaData.type('transactions').types.get();
    const activityTypesTask = papiClient.metaData.type('activities').types.get();
    const accountTypesTask = papiClient.metaData.type('accounts').types.get();
    const transactionFieldsTask = papiClient.metaData.type('transactions').fields.get();
    const activityFieldsTask = papiClient.metaData.type('activities').fields.get();
    const transactionLineFieldsTask = papiClient.metaData.type('transaction_lines').fields.get();
    const itemFieldsTask = papiClient.metaData.type('items').fields.get();
    const accountFieldsTask = papiClient.metaData.type('accounts').fields.get();
    const userDefinedTablesTask = papiClient.metaData.userDefinedTables.iter({include_deleted:false}).toArray();

    // Working users/buyers created at least one new activity in all_activities in the last month.
    let lastMonth = new Date(Date.now());
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthString = lastMonth.toISOString();

    // Hack: shorten ISO format, remove the time. This is b/c papi cannot parse ISO string with decimal point for seconds.
    // See: https://pepperi.atlassian.net/browse/DI-18019
    const lastMonthStringWithoutTime = lastMonthString.split('T')[0] + 'Z';
    const allActivitiesUsersAndBuyersTask = papiClient.allActivities.count({where:"CreationDateTime>'" + lastMonthStringWithoutTime + "'", group_by:"CreatorInternalID"});

    const transactionsTask = papiClient.transactions.count({include_deleted:false});
    const activitiesTask = papiClient.activities.count({include_deleted:false});
    const transactionLinesTask = papiClient.transactionLines.count({include_deleted:false});
    const imagesTask = papiClient.images.count({where:'ImageType=1'});
    const userDefinedTablesLinesTask = papiClient.userDefinedTables.count({include_deleted:false});

    const distributorTask = service.GetDistributor(papiClient);

    // Await all regular tasks
    let actualUsersCount: any = null;
    try {
        actualUsersCount = await usersTask;
    }
    catch (error) {
        errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'});
    }

    let accountsCount: any = null;
    try {
        accountsCount = await accountsTask;
    } catch (error) {
        errors.push({object:'Accounts', error:('message' in error) ? error.message : 'general error'});
    }

    let itemsCount: any = null;
    try {
        itemsCount = await itemsTask;
    } catch (error) {
        errors.push({object:'Items', error:('message' in error) ? error.message : 'general error'});
    }

    let catalogsCount: any = null;
    try {
        catalogsCount = await catalogsTask;
    } catch (error) {
        errors.push({object:'Catalogs', error:('message' in error) ? error.message : 'general error'});
    }
    
    let contactsCount: any = null;
    try {
        contactsCount = await contactsTask;
    } catch (error) {
        errors.push({object:'Contacts', error:('message' in error) ? error.message : 'general error'});
    }

    let buyersObjects: any[] = [];
    let buyersCount: any = null;
    try {
        buyersObjects = await buyersObjectsTask;
        buyersCount = buyersObjects.length;
    } catch (error) {
        errors.push({object:'Buyers', error:('message' in error) ? error.message : 'general error'});
    }
    
    let profilesCount: any = null;
    try {
        profilesCount = await profilesTask;
    } catch (error) {
        errors.push({object:'Profiles', error:('message' in error) ? error.message : 'general error'});
    }

    let transactionTypesCount: any = null;
    try {
        transactionTypesCount = (await transactionTypesTask).length;
    } catch (error) {
        errors.push({object:'TransactionTypes', error:('message' in error) ? error.message : 'general error'});
    }

    let activityTypesCount: any = null;
    try {
        activityTypesCount = (await activityTypesTask).length;
    } catch (error) {
        errors.push({object:'ActivityTypes', error:('message' in error) ? error.message : 'general error'});
    }
    
    let accountTypesCount: any = null;
    try {
        accountTypesCount = (await accountTypesTask).length;
    } catch (error) {
        errors.push({object:'AccountTypes', error:('message' in error) ? error.message : 'general error'});
    }

    let transactionFieldsCount: any = null;
    try {
        transactionFieldsCount = (await transactionFieldsTask).length;
    } catch (error) {
        errors.push({object:'TransactionFields', error:('message' in error) ? error.message : 'general error'});
    }

    let activityFieldsCount: any = null;
    try {
        activityFieldsCount = (await activityFieldsTask).length;
    } 
    catch (error) {
        errors.push({object:'ActivityFields', error:('message' in error) ? error.message : 'general error'});
    }

    let transactionLineFieldsCount: any = null;
    try {
        transactionLineFieldsCount = (await transactionLineFieldsTask).length;
    } 
    catch (error) {
        errors.push({object:'TransactionLinesFields', error:('message' in error) ? error.message : 'general error'});
    }

    let itemFieldsCount: any = null;
    try {
        itemFieldsCount = (await itemFieldsTask).length;
    } 
    catch (error) {
        errors.push({object:'ItemFields', error:('message' in error) ? error.message : 'general error'});
    }

    let accountFieldsCount: any = null;
    try {
        accountFieldsCount = (await accountFieldsTask).length;
    } 
    catch (error) {
        errors.push({object:'AccountFields', error:('message' in error) ? error.message : 'general error'});
    }

    let userDefinedTablesCount: any = null;
    try {
        userDefinedTablesCount = (await userDefinedTablesTask).length;
    } 
    catch (error) {
        errors.push({object:'UserDefinedTables', error:('message' in error) ? error.message : 'general error'});
    }
    
    var workingUsers = 0;
    var workingBuyers = 0;
    // Iterate all working users and buyers, get which ones are buyers (the rest are users).
    try {
        const allActivitiesUsersAndBuyers = await allActivitiesUsersAndBuyersTask;

        // Iterate buyersObject, see which ones appear in allActivitiesUsersAndBuyers to get the number of working buyers (the rest are working users).
        buyersObjects.forEach(buyerObject => {
            const buyerInternalID = buyerObject['InternalID'] as number;
            allActivitiesUsersAndBuyers[buyerInternalID] && allActivitiesUsersAndBuyers[buyerInternalID] > 0 ? workingBuyers++ : null;
        });

        workingUsers = Object.keys(allActivitiesUsersAndBuyers).length - workingBuyers;
    }
    catch (error) {
        errors.push({object:'WorkingUsers', error:('message' in error) ? error.message : 'general error'});
    }

    let transactionsCount: any = null;
    try {
        transactionsCount = await transactionsTask;
    }
    catch (error) {
        errors.push({object:'Transactions', error:('message' in error) ? error.message : 'general error'});
    }
    
    let activitiesCount: any = null;
    try {
        activitiesCount = await activitiesTask;
    }
    catch (error) {
        errors.push({object:'Activities', error:('message' in error) ? error.message : 'general error'});
    }

    let transactionLinesCount: any = null;
    try {
        transactionLinesCount = await transactionLinesTask;
    }
    catch (error) {
        errors.push({object:'TransactionLines', error:('message' in error) ? error.message : 'general error'});
    }

    let imagesCount: any = null;
    try {
        imagesCount = await imagesTask;
    }
    catch (error) {
        errors.push({object:'Images', error:('message' in error) ? error.message : 'general error'});
    }

    let userDefinedTablesLinesCount: any = null;
    try {
        userDefinedTablesLinesCount = await userDefinedTablesLinesTask;
    } 
    catch (error) {
        errors.push({object:'UserDefinedTablesLines', error:('message' in error) ? error.message : 'general error'});
    }

    let distributorData: any = null;
    try {
        distributorData = (await distributorTask);
    } 
    catch (error) {
        errors.push({object:'distributorData', error:('message' in error) ? error.message : 'general error'});
    }

    // Result object construction
    const result = {
        Setup: {},
        Usage: {},
        Data: {},
        Errors: {},
        CRMData: {},
        Key: new Date(Date.now()).toISOString(),
        ExpirationDateTime: service.getExpirationDateTime(),
        Year: service.getFullYear(),
        Week: service.getNumberOfWeek(),
        DistributorUUID: distributorData.UUID,
        DistributorInternalID: distributorData.InternalID
    };
    result.Setup = {
        LicensedUsers: distributorData.MaxEmployees,
        ActualUsers: actualUsersCount, 
        Accounts: accountsCount,
        Items: itemsCount,
        Catalogs: catalogsCount,
        Contacts: contactsCount,
        Buyers: buyersCount,
        Profiles: profilesCount,
        TransactionTypes: transactionTypesCount,
        ActivityTypes: activityTypesCount,
        AccountTypes: accountTypesCount,
        TransactionFields: transactionFieldsCount,
        ActivityFields: activityFieldsCount,
        TransactionLineFields: transactionLineFieldsCount,
        ItemFields: itemFieldsCount,
        AccountFields: accountFieldsCount,
        UserDefinedTables: userDefinedTablesCount,
        SecurityGroups: null
    };

    result.Usage = {
        WorkingUsers: workingUsers,
        WorkingBuyers: workingBuyers
    }

    result.Data = {
        NucleusTransactions: transactionsCount,
        NucleusActivities: activitiesCount,
        NucleusTransactionLines: transactionLinesCount,
        DatabaseAllActivities: null,
        Images: imagesCount,
        UserDefinedTablesLines: userDefinedTablesLinesCount,
        Attachments: null
    }

    result.Errors = errors;

    console.log("Finished all calls for data, leaving.");
    
    return result;
}