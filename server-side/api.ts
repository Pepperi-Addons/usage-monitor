import MyService from './my.service'
import { Client, Request } from '@pepperi-addons/debug-server'
import { UsageMonitorTable } from './installation'
import { createPepperiUsage } from './crm-connector'
import { get } from 'lodash';
import peach from 'parallel-each';
import { PapiClient } from '@pepperi-addons/papi-sdk';
import jwtDecode from "jwt-decode";

//for nucleus Activities the limit is 2 million
// TODO: this should be moved in the future to the core addon or core resource 
const nucleusActivitiesLimit = 2*(Math.pow(10,5));
//for user Defined Tables and nucleus Transaction Lines the limit is 10 million
const usageDatalimit = 10*(Math.pow(10,5));

export function buildObjectsForDIMX(client: Client, request: Request){
    let DIMXObject = request.body;
    let modObject = filterObject(DIMXObject, "Description");
    return modObject;
}

export async function get_relations_daily_data_and_send_errors(client: Client, request: Request){
    await getRelationsDailyData(client, request);
    //await MonitorErrors(client, request);
}

//The function is called by health monitor relation
//If activities/transactions/UTDs count crossed the defined limit, print an error
export async function MonitorErrors(client: Client, request: Request){
    const service = new MyService(client);
    let returnedObject = {
        InternalError: "",
        status: "SUCCESS"
    }
    await checkResourceLimit(client, request, returnedObject)

    if(returnedObject.InternalError != ""){
        let headers = {
            "X-Pepperi-OwnerID" : client.AddonUUID,
            "X-Pepperi-SecretKey" : client.AddonSecretKey
        }
        let body = {
            Name: "Usage Monitor Limit",
            Description: "Check if usage data passed the limit",
            Status: returnedObject.status,
            Message: returnedObject.InternalError
        }
        const Url: string = `/system_Health/notifications`;
        try{
            console.log(`About to call system health with body ${JSON.stringify(body)}`);
            const res = await service.papiClient.post(Url, body, headers);
            console.log(`Succeed call system health notifications`);

        }
        catch(err){
            console.log("Error while calling system health:" + err);
        }
    }
}

async function checkResourceLimit(client: Client, request: Request, returnedObject){
    let activityList = ['UserDefinedTables', 'NucleusTransactionLines', 'NucleusActivities']
    //called by UI "update now" - data is extracted by "collect_data" in the client-side
    if(Object.keys(request.body).length != 0){
        for(const element in request.body){
            if(activityList.includes(element)){
                updateReturnedObject(returnedObject, element, request.body[element]);
            }
        }
    }
    //function executed by codeJob - data is extracted from adal
    else{
        let allData = await get_latest_data(client, request);
        if(allData){
            for(const element of activityList){
                let resourceData = allData['Data'][element];
                updateReturnedObject(returnedObject, element, resourceData)
            }
        }   
    }
}

function updateReturnedObject(returnedObject, element, resourceValue){
    if((element == 'NucleusActivities' && resourceValue >= nucleusActivitiesLimit) || resourceValue >= usageDatalimit){
        returnedObject.status = "ERROR"
        returnedObject.InternalError += `${element} count crossed the limit. `;
    }
    return returnedObject;    
}

//daily data insertion to UsageMonitorDaily table
async function getRelationsDailyData(client:Client, request:Request){
    const service = new MyService(client);
    let relations = await service.papiClient.addons.data.relations.iter({where:'RelationName=UsageMonitor'}).toArray();
    let ExpirationDateTime: Date = new Date(new Date().setFullYear(new Date().getFullYear() + 1));

    try{
        await peach(relations, async(subRelations, i)=>{
            await insertRelationData(service, client, subRelations, ExpirationDateTime)
        }, relations.length);
    }

    catch(ex){
        console.log("Error:"+`${ex}`);
    }
}


async function insertRelationData(service, client, subRelations, ExpirationDateTime){
        let UUID: string= GenerateGuid();
        let asyncPapiClient = new PapiClient({
            baseURL: client.BaseURL,
            token: client.OAuthAccessToken,
            addonUUID: client.AddonUUID,
            addonSecretKey: client.AddonSecretKey,
            actionUUID: UUID
        });
        console.log("Working on ActionUUID:" + UUID);

        const url = `/addons/api/async/${subRelations.AddonUUID}${subRelations.AddonRelativeURL?.startsWith('/') ? subRelations.AddonRelativeURL : '/' + subRelations.AddonRelativeURL}`;
        console.log("Calling to URL:" + url);

        let getRelationData = await asyncPapiClient.get(url);
        let auditLogUUID = getRelationData['ExecutionUUID'];
        console.log("ExecutionUUID:" + getRelationData['ExecutionUUID']);

        let auditResult = await getReturnObjectFromAudit(auditLogUUID, service);

        let title = auditResult["Title"];
        let resource = auditResult["Resources"];
        let AddonUUID_RelationName = subRelations.AddonUUID + "_" + subRelations["Name"];
        let RelationData = {
            Title: title,
            Resources: resource
        }
        
        let insertRelation = {
            Key: UUID,
            AddonUUID_RelationName: AddonUUID_RelationName,
            ExpirationDateTime: ExpirationDateTime,
            RelationData: RelationData
        }
        console.log(`About to insert ${subRelations["Name"]} to UsageMonitorDaily`);
        await asyncPapiClient.addons.data.uuid(client.AddonUUID).table('UsageMonitorDaily').upsert(insertRelation);
        console.log(`${subRelations["Name"]} was inserted to UsageMonitorDaily`);

}

// polling audit log until getting the final result success or failure
async function getReturnObjectFromAudit(auditLogUUID: string, service): Promise<any> {
    return new Promise<any>((resolve) => {
        let numOfTries = 1;
        const interval = setInterval(async () => {
            const logRes = await service.papiClient.auditLogs.uuid(auditLogUUID).get();
            if (logRes && logRes.Status && logRes.Status.Name !== 'InProgress' && logRes.Status.Name !== 'InRetry') {
                clearInterval(interval);
                const resultObj = JSON.parse(logRes.AuditInfo.ResultObject);
                resolve(resultObj);
            }
            else if(++numOfTries > 16) {
                clearInterval(interval);
                resolve(undefined);
            }
        }, 30000);
    });
}


//for generating a new UUID
function GenerateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


// Random data
    
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

// Hard coded data
export async function mock_relation2() {
    return {
        Title: "Mock Relation",
        Resources: [
            {Data: "Data 1", Description: "Description 1", Size: 1},
            {Data: "Data 2", Description: "Description 2", Size: 2}
        ]
    }
}

// Hard coded data - same title as in previous relations
export async function mock_relation3() {
    return {
        Title: "Mock Relation",
        Resources: [
            {Data: "Data 10", Description: "Description 10", Size: 10},
            {Data: "Data 20", Description: "Description 20", Size: 20},
            {Data: "Data 30", Description: "Description 30", Size: 30}
        ]
    }
}

// Relation data should be added to "Usage" tab
export async function mock_relation4() {
    return {
        Title: "Usage",
        Resources: [
            {Data: "Usage 100", Description: "Description 100", Size: 100},
            {Data: "Usage 200", Description: "Description 200", Size: 200}
        ]
    }
}

// Relation data should be added to "Data" tab
export async function mock_relation5() {
    return {
        Title: "Data",
        Resources: [
            {Data: "Data 1000", Description: "Description 1000", Size: 1000},
            {Data: "Data 2000", Description: "Description 2000", Size: 2000}
        ]
    }
}

// Gets all data from relations posted to usage monitor. 
// See https://apidesign.pepperi.com/add-ons/addons-link-table/relation-names/usage-monitor
export async function get_relations_data(client: Client) {
    const service = new MyService(client);

    let getRelationsResultObject = {
        Data: [],
        Usage: [],
        Setup: [],
        Relations: {}
    };

    let relationsDataList: {
        [key: string]: 
            {
                Data: string,
                Description: string,
                Size: number
            }[]        
    }[] = [];
    try{
        console.log("About to get all relations with RelationName=UsageMonitor and insert data to getRelationsResultObject");
        await service.papiClient.addons.data.relations.iter({where:'RelationName=UsageMonitor'}).toArray()
        .then(async x => {
            let usageRelation = x;
            for(let index=0; index < usageRelation.length; index++){
                //If reporting period is weekly
                if((usageRelation[index]['ReportingPeriod']== "Weekly" || (!usageRelation[index]['ReportingPeriod']) ) ){
                    //If Aggregation Function is sum, sum all data from last week.
                    if(usageRelation[index]['AggregationFunction']== "SUM"){
                        await GetDataForSUMAggregation(client, usageRelation, index, getRelationsResultObject, relationsDataList);
                    }
                    
                    //If Aggregation Function is last, take the latest data that was inserted to the table.
                    if(usageRelation[index]['AggregationFunction']== "LAST" || (!usageRelation[index]['AggregationFunction']) ){
                        await GetDataForLASTAggregation(client, usageRelation, index, getRelationsResultObject, relationsDataList);                    
                    }
                }
            } 
        })
        console.log("Got all relations with RelationName=UsageMonitor");    
    } catch (error) {
        console.log("Got error in get_relations_data, error: " + error);
    }
    
    getRelationsResultObject.Relations = relationsDataList;
    return getRelationsResultObject;
}


//If aggregation function is sum
async function GetDataForSUMAggregation(client, usageRelation, index, getRelationsResultObject, relationsDataList){
    const service = new MyService(client);
    const papiClient = service.papiClient;

    let sum: number = 0;
    let id = usageRelation[index]['AddonUUID'] + "_"+usageRelation[index]["Name"];

    //checking for a span of a week
    let startTime: Date = new Date();
    startTime.setDate(startTime.getDate() -8);
    const startTimeString = startTime.toISOString();

    let dateCheck: string = "CreationDateTime>='"+ startTimeString+"'";
            
    const usageMonitorUUID: string = client.AddonUUID;
    const dailyUsageTable: string = 'UsageMonitorDaily';

    let Params: string = `AddonUUID_RelationName='${id}' and ${dateCheck}`;
    try{
        console.log(`About to get data with parameters : ${Params}`);
        const Result = await papiClient.addons.data.uuid(usageMonitorUUID).table(dailyUsageTable).iter({where: Params, order_by: "CreationDateTime DESC"}).toArray();
        console.log(`Got all data with parameters : ${Params}`);
        let retObj = (Result && Result[0]) ? Result[0] : undefined;

        let todayDate: Date = new Date();
        let todayDateString = (todayDate.getDate()).toString();

        //extract the first element from Result in order to check if its date is from today or yesterday
        let firstElementDate = (Result[0]) ? Result[0]['CreationDateTime'] : undefined;
        //extract only the day from the date string
        let firstElementDateString = (firstElementDate) ? (((firstElementDate.split("-"))[2]).slice(0,2)).toString() : undefined;

        //checking if the first item in the array is from today or yesterday- if it is from today we take the second element in the array (from yesterday), else we take the first.
        //if the last item is from today
        if(retObj){
            if(firstElementDateString && firstElementDateString == todayDateString){
                if(Result[1]){
                    let start = 1;
                    buildRelation(Result, retObj, start, sum, getRelationsResultObject, relationsDataList);
                }
            }
            //if the last item is from yesterday
            else{
                if(Result[0]){
                    let start = 0;
                    buildRelation(Result, retObj, start, sum, getRelationsResultObject, relationsDataList);
                }
            }
        }
    } catch(err){
        console.log(`Failed retrieving data for GetDataForSUMAggregation, parameters : ${Params}, error : ${err}`)
    }

    
}

function buildRelation(Result, retObj, start, sum, getRelationsResultObject, relationsDataList){
    //check sum for every data in resources
    for(let i= 0; i < retObj['RelationData']['Resources'].length; i++){
        sum = aggregateData(Result, i, start);
        retObj['RelationData']['Resources'][i]['Size'] = sum;
        retObj['RelationData']['Resources'][i]['Description'] = retObj['RelationData']['Resources'][i]['Description'] + " - in the last 7 days";
    }
    //insert retObj to the exported array
    insert_Relation(retObj['RelationData'], getRelationsResultObject, relationsDataList);
}


//If aggregation function is last
async function GetDataForLASTAggregation(client, usageRelation, index, getRelationsResultObject, relationsDataList){
    const service = new MyService(client);
    const papiClient = service.papiClient;
    let id = usageRelation[index]['AddonUUID'] + "_" + usageRelation[index]["Name"];

    let Params: string = `where=AddonUUID_RelationName='${id}'&order_by=CreationDateTime DESC&page_size=1`;

    const usageMonitorUUID: string = client.AddonUUID;
    const dailyUsageTable: string = 'UsageMonitorDaily';
    const Url: string = `${usageMonitorUUID}/${dailyUsageTable +'?'+ Params}`;
    try{
        console.log(`About to get data at URL : ${Url}`);
        const Result = await papiClient.get(`/addons/data/${Url}`);
        console.log(`Got all data : ${Url}`);
        let lastData = (Result && Result[0]) ? Result[0]['RelationData'] : undefined;
        insert_Relation(lastData, getRelationsResultObject, relationsDataList);
    } catch(err){
        console.log(`Failed retrieving data : ${Url}, error : ${err}`)
    }    
}



//If agrregation function is sum- sum all of the data from the relevant field.
function aggregateData(Result, i, start){
    let sum = 0;
    //checking for a span of a week
    for(let index= start; index < 8;index++){
        if(Result[index] && Result[index]['RelationData'] && Result[index]['RelationData']['Resources'] && Result[index]['RelationData']['Resources'][i]){
            sum += Result[index]['RelationData']['Resources'][i]['Size'];
        }
    }
    return sum;
}

//insert the relation to getRelationsResultObject table
function insert_Relation(resource, getRelationsResultObject, relationsDataList){
    
    try {
            if (["Data", "Setup", "Usage"].includes(resource.Title)) {
                getRelationsResultObject[resource.Title] = getRelationsResultObject[resource.Title].concat(resource.Resources);
            }
            else {
                // Allow multiple relations to reside in the same tab (title)
                let index = relationsDataList.map(x => Object.keys(x)[0]).indexOf(resource.Title);
                if (index > -1) {

                    // Add resources to existing one in same tab
                    relationsDataList[index][resource.Title] = relationsDataList[index][resource.Title].concat(resource.Resources);
                }
                else {
                    relationsDataList.push({
                    [resource.Title]: resource.Resources
                })}}
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

/*
// Gets all data from relations posted to usage monitor. 
// See https://apidesign.pepperi.com/add-ons/addons-link-table/relation-names/usage-monitor
export async function get_relations_data1(client: Client) {
    const service = new MyService(client);
    const papiClient = service.papiClient;

    const relations = papiClient.addons.data.relations.iter({where: "RelationName='UsageMonitor'"});

    let getRelationsResultObject = {
        Data: [],
        Usage: [],
        Setup: [],
        MonthlyUsage:[],
        Relations: {}
    };

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
            // Rearrange data from all external sources as a list of objects, each one has the title as key, and list of resources as value.
            arrPromises.push(service.papiClient.get(url).then(data => {

                if (["Data", "Setup", "Usage", "MonthlyUsage"].includes(data.Title)) {
                    getRelationsResultObject[data.Title] = getRelationsResultObject[data.Title].concat(data.Resources);
                }
                else {
                    // Allow multiple relations to reside in the same tab (title)
                    let index = relationsDataList.map(x => Object.keys(x)[0]).indexOf(data.Title);
                    if (index > -1) {

                        // Add resources to existing one in same tab
                        relationsDataList[index][data.Title] = relationsDataList[index][data.Title].concat(data.Resources);
                    }
                    else {
                        relationsDataList.push({
                        [data.Title]: data.Resources
                    })}}
                })
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

    // getRelationsResultObject.Usage = [
    //     {Data: "AmirUsage1", Description: "AmirUsage1 Description1", Size: 17},
    //     {Data: "AmirUsage2", Description: "AmirUsage2 Description2", Size: 36}
    // ];

    getRelationsResultObject.Relations = relationsDataList;

    return getRelationsResultObject;
}
*/

// Gets all data from adal
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

        //If objectValue is in a different format (description + size instead of size)- then we take only the size field 
        //(can happan in case of a relation that doesn`t appear in a relation tab)
        if(objectValue != null && objectValue['Size'] != null){
            objectValue = objectValue['Size'];
        }

        return objectValue;
    }
    catch (error)
    {
        if (error instanceof Error)
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
        // Filter out the entries which do not have a value (undefined).
        const all_data_for_key = sorted_all_data?.reduce((filtered, obj) => {
            let objectValue = get_object_value(obj, requestedKey);
            if (objectValue !== undefined) {
                let date: string = obj?.Key!.toString();
                filtered.push({[date]: objectValue});
            }
            return filtered;
        }, []);

        return all_data_for_key;
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
    catch (error)
    {
        if (error instanceof Error)
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
        if (error instanceof Error)
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
        if (error instanceof Error)
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
        if (error instanceof Error) {
            const errorObj = {
                Key: new Date(Date.now()).toISOString(),
                Message: error.message
            };
            await papiClient.addons.data.uuid(client.AddonUUID).table("UsageMonitorDebug").upsert(errorObj);
        }
    }
}

//modify usage data to be without description
function removeDescriptionFromCollectData(res_collect_data){
    //copy by value
    let mod_res_collect_data = JSON.parse(JSON.stringify(res_collect_data));
    
    let options = ['Data', 'Setup', 'Usage'];
    for(let i = 0; i < 3; i++){
        modifySubData(mod_res_collect_data, options[i]);
    }

    filterObject(mod_res_collect_data['RelationsData'], 'Description')
    return mod_res_collect_data;
}

//remove description from RelationsData tab
function filterObject(obj, key) {
    for (let i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        if (typeof obj[i] == 'object') {
            filterObject(obj[i], key);
        } else if (i == key) {
            delete obj[key];
        }
    }
    return obj;
}

//remove description from Data, Usage and Setup tabs
function modifySubData(mod_res_collect_data, option){
    for (let key of Object.keys(mod_res_collect_data[option])){
        let value = mod_res_collect_data[option][key];
        if(value && value!= undefined && value['Description'] && value['Description'] != undefined){
            let size = value['Size'];
            mod_res_collect_data[option][key] = size ;
        }
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
    catch (error)
    {
        if (error instanceof Error)
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
    let environment: string;

    try {
        console.log("About to call collect_data...");

        // Run main data collection function
        const res_collect_data = await collect_data(client, request);

        let res_collect_data_without_description = removeDescriptionFromCollectData(res_collect_data);

        // Insert data to CRM. 
        // Need to do this synchronously by using http call instead of direct function call (code jobs don't have permission to get parameter from parameter store)
        console.log("About to call function push_data_to_crm over http...");
        environment = jwtDecode(client.OAuthAccessToken)["pepperi.datacenter"];

        if(environment == "prod" || environment == "eu"){
            let retCRM = await papiClient.addons.api.uuid(client.AddonUUID).file('api').func('push_data_to_crm').post({}, res_collect_data_without_description);
            console.log("Response from push_data_to_crm: " + JSON.stringify(retCRM));
            res_collect_data.CRMData = retCRM;
        }
    
        console.log(`About to add data to table ${UsageMonitorTable.Name}.`);

        // Insert results to ADAL
        await papiClient.addons.data.uuid(client.AddonUUID).table(UsageMonitorTable.Name).upsert(res_collect_data);

        console.log("Data added to table successfully, leaving.");

        return res_collect_data;
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

// Main function to get all data from api calls, gather the data in one result object, including relations data.
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
    let usersObjects: any[] = [];


    // Working users/buyers created at least one new activity in all_activities in the last month.
    let lastMonth = new Date(Date.now());
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthString = lastMonth.toISOString();

    let allActivities={};
    // Hack: shorten ISO format, remove the time. This is b/c papi cannot parse ISO string with decimal point for seconds.
    // See: https://pepperi.atlassian.net/browse/DI-18019
    const lastMonthStringWithoutTime = lastMonthString.split('T')[0] + 'Z';
    const allActivitiesUsersAndBuyersTask:any =  papiClient.allActivities.count({where:"CreationDateTime>'" + lastMonthStringWithoutTime + "'", group_by:"CreatorInternalID"})
        .catch(error => errors.push({object:'AllActivitiesUsersAndBuyers', error:('message' in error) ? error.message : 'general error'}));

    
    
    let workingUsers = 0;
    let workingBuyers = 0;

    let relationsData: any = null;
    let dataAdditionalRelations: any = null;
    let usageAdditionalRelations: any = null;
    let setupAdditionalRelations: any = null;


    await Promise.all([
        /*
        papiClient.users.count({include_deleted:false})
            .then(x => actualUsersCount = x)
            .catch(error => errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'})),
        papiClient.users.count({include_deleted:false})
            .then(x => actualUsersCount = x)
            .catch(error => errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'})),
        */
        
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
                    //get the number of activity and transactions created by buyers.
                    buyersObjects.forEach(buyerObject => {
                        const buyerInternalID = buyerObject['InternalID'] as number;
                        if(allActivitiesUsersAndBuyers[buyerInternalID] && allActivitiesUsersAndBuyers[buyerInternalID] > 0){
                            workingBuyers++;
                        }});
                    //workingUsers = Object.keys(allActivitiesUsersAndBuyers).length - workingBuyers;
                }
                catch (error) {
                    if (error instanceof Error)
                    errors.push({object:'WorkingUsers', error:('message' in error) ? error.message : 'general error'});
                }
            })
            .catch(error => errors.push({object:'Buyers', error:('message' in error) ? error.message : 'general error'})),

        //for working users calculation
        papiClient.users.iter({include_deleted:false}).toArray()
            .then(async x => {
                usersObjects = x;
                actualUsersCount = x.length;
                // Iterate all working users and buyers, get which ones are users.
                try {
                    // The following code dependes on both allActivitiesUsersAndBuyersTask and users tasks:
                    const allActivitiesUsersAndBuyers = await allActivitiesUsersAndBuyersTask;

                    // Iterate usersObject, see which ones appear in allActivitiesUsersAndBuyers to get the number of working users.
                    //get the number of activity and transactions created by users.
                    usersObjects.forEach(userObject => {
                        const userInternalID = userObject['InternalID'] as number;
                        if(allActivitiesUsersAndBuyers[userInternalID] && allActivitiesUsersAndBuyers[userInternalID] > 0){
                            workingUsers++;
                        }});
                }
                catch (error) {
                    if (error instanceof Error)
                    errors.push({object:'WorkingUsers', error:('message' in error) ? error.message : 'general error'});
                }
            })
            .catch(error => errors.push({object:'ActualUsers', error:('message' in error) ? error.message : 'general error'})),     

        await get_relations_data(client)
            .then( async x => { 
                relationsData = (x as any).Relations; 
                dataAdditionalRelations = (x as any).Data;
                usageAdditionalRelations = (x as any).Usage;
                setupAdditionalRelations = (x as any).Setup;
                
            })
            .catch(error => errors.push({object:'RelationsData', error:('message' in error) ? error.message : 'general error'}))
    ] as Promise<any>[])

    // Result object construction
    var result = {
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
        distributorAccountingStatus: distributorDataAccountingStatus,
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
    
    // Add additional data/setup/usage relations to result object
    dataAdditionalRelations.forEach(element => {
        result.Data[element.Data] = {Description: element.Description, Size: element.Size};
    });
    usageAdditionalRelations.forEach(element => {
        result.Usage[element.Data] = {Description: element.Description, Size: element.Size};
    });
    setupAdditionalRelations.forEach(element => {
        result.Setup[element.Data] = {Description: element.Description, Size: element.Size};
    });

    return result;
}