import { createDataProvider, CreateDataProviderOptions } from "@refinedev/rest";
import { BACKEND_URL } from "@/constants";
import { ListResponse } from "@/types";

if (!BACKEND_URL) {
    throw new Error('Missing backend URL');
}
const options: CreateDataProviderOptions = {
    getList: {
        getEndpoint: ({ resource }) => resource,

        buildQueryParams: async ({ resource, pagination, filters, sorters }) => {
            const page = pagination?.currentPage ?? 1;
            const pageSize = pagination?.pageSize ?? 10;

            const params: Record<string, string | number> = { page, limit: pageSize };

            // Handle filters
            filters?.forEach((filter) => {
                const field = 'field' in filter ? filter.field : '';
                const value = filter.value;

                if (!value || value === '' || value === 'undefined' || value === 'null') {
                    return;
                }

                if (resource === 'deals') {
                    if (field === 'accountName' || field === 'opportunityName') {
                        params.search = String(value);
                    }
                    if (field === 'stage') {
                        params.stage = String(value);
                    }
                }
            });

            // Handle sorters - send sort field and order to backend
            if (sorters && sorters.length > 0) {
                const primarySorter = sorters[0];
                params.sort = primarySorter.field;
                params.order = primarySorter.order;
            }

            return params;
        },

        mapResponse: async (response) => {
            const payload: ListResponse = await response.clone().json();
            return payload.data ?? [];
        },

        getTotalCount: async (response) => {
            const payload: ListResponse = await response.clone().json();
            return payload.pagination?.total ?? payload.data?.length ?? 0;
        }
    }
}

const { dataProvider } = createDataProvider(BACKEND_URL, options);
export { dataProvider };