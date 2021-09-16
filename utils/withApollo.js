import { ApolloClient, HttpLink, split, from } from "@apollo/client";
import { InMemoryCache } from "@apollo/client/cache";
import { WebSocketLink } from "@apollo/client/link/ws";
import { getMainDefinition } from "@apollo/client/utilities";
import fetch from "isomorphic-unfetch";
import ws from "isomorphic-ws";
import React from "react";
import { SubscriptionClient } from "subscriptions-transport-ws";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import merge from 'deepmerge'
import isEqual from 'lodash/isEqual'

const createHttpLink = (authUser) => {
    const getHttpUri = () => {
        // if (process.env.NODE_ENV === "production") {
        //     return process.env.NEXT_PUBLIC_API_URL;
        // }
        return process.browser
            ? process.env.NEXT_PUBLIC_CSR_API_URL
            : process.env.NEXT_PUBLIC_SSR_API_URL;
    };

    const logoutLink = onError(({ networkError }) => {
        if (networkError.statusCode === 401) console.log("401 Unauthorized"); //logout();
    });

    const authLink = setContext(async (_, { headers }) => {
        const token = await authUser.getIdToken();

        return {
            headers: {
              ...headers,
              authorization: token ? `Bearer ${token}` : "",
            }
        }
    });

    const httpLink = new HttpLink({
        uri: getHttpUri(),
        fetch,
    });

    return from([logoutLink, authLink, httpLink]);
};

const createWSLink = (authUser) => {
    return new WebSocketLink(new SubscriptionClient(process.env.NEXT_PUBLIC_CSR_WS_URL, {
        lazy: true,
        reconnect: true,
        connectionParams: async () => {
            const token = await authUser.getIdToken()
            return {
                headers: { Authorization: `Bearer ${token}` },
            };
        },
    }, ws));
};

let apolloClient, authUser;
export const createApolloClient = (authUser) => {
    const ssrMode = typeof window === "undefined";
    const link = !ssrMode
        ? split(({ query }) => {
            const definition = getMainDefinition(query);
            return (definition.kind === "OperationDefinition" &&
                definition.operation === "subscription");
        }, createWSLink(authUser), createHttpLink(authUser))
        : createHttpLink(authUser);

    return new ApolloClient({ ssrMode, link, cache: new InMemoryCache() });
};

export const initializeApollo = (initialState = {}, user) => {
    const doNotUpdate = apolloClient !== null && apolloClient !== void 0 && isEqual(authUser, user);

    const _apolloClient = doNotUpdate ? apolloClient : createApolloClient(user);

    // If your page has Next.js data fetching methods that use Apollo Client, the initial state
    // gets hydrated here
    if (initialState) {
        // Get existing cache, loaded during client side data fetching
        const existingCache = _apolloClient.extract()

        // Merge the existing cache into data passed from getStaticProps/getServerSideProps
        const data = merge(initialState, existingCache, {
        // combine arrays using object equality (like in sets)
        arrayMerge: (destinationArray, sourceArray) => [
            ...sourceArray,
            ...destinationArray.filter((d) =>
            sourceArray.every((s) => !isEqual(d, s))
            ),
        ],
        })

        // Restore the cache with the merged data
        _apolloClient.cache.restore(data)
    }

    if (typeof window === "undefined") {
        return _apolloClient;
    }
    if (!doNotUpdate) {
        apolloClient = _apolloClient;
        authUser = user;
    }
    return _apolloClient;
};

export function useApollo(initialState, authUser) {
    const store = React.useMemo(() => initializeApollo(initialState, authUser), [initialState, authUser]);
    return store;
}