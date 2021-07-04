export type RemoteModuleOptions = {
    addonData?: object;
    componentName: string;
    exposedModule?: string;
    remoteEntry?: string;
    remoteName: string;
    update?: boolean;
    noModule?: boolean;
    title: string;
    visibleEndpoint?: string;
    multiSelection?: boolean | string ;
    confirmation?: boolean;
    type: string | string[];
    subType: string | string[];
    uuid: string;
    UUID?: string;
    addon?: object;
  }

  export interface ListSearch {
      type?: string;
      subType?: string;
      sortBy?: string;
      isAsc?: boolean;
      searchString?: string;
  }

  export enum ObjectType   {
    transactions = 2,        // Order
    contacts = 33,           // ContactPerson
    accounts = 35,           // DistributorStoreOrganizationsRelation
    activities = 99,         // GeneralActivity          
    transaction_lines = 10  // OrderPortfolioItem
}


export const relationTypesEnum = {
  'accounts': 'Account',
  'transactions': 'Transaction',
  'activities': 'Activity'
}