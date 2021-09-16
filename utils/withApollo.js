import { ApolloClient, HttpLink, split } from "@apollo/client";
import { InMemoryCache } from "@apollo/client/cache";
import { WebSocketLink } from "@apollo/client/link/ws";
import { getMainDefinition } from "@apollo/client/utilities";
import fetch from "isomorphic-unfetch";
import ws from "isomorphic-ws";
import React from "react";
import { SubscriptionClient } from "subscriptions-transport-ws";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";

const createHttpLink = (authUser) => {
    const getHttpUri = () => {
        // if (process.env.NODE_ENV === "production") {
        //     return process.env.NEXT_PUBLIC_API_URL;
        // }
        return process.browser
            ? process.env.NEXT_PUBLIC_CSR_API_URL
            : process.env.NEXT_PUBLIC_SSR_API_URL;
    };

    const authLink = setContext(async (_, { headers }) => {
        const token = await authUser.getIdToken()
        console.log("Auth User", authUser);
        console.log("Token", token);

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

    return authLink.concat(httpLink);
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

let apolloClient;
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

export const initializeApollo = (initialState = {}, authUser) => {
    const _apolloClient = apolloClient !== null && apolloClient !== void 0 ? apolloClient : createApolloClient(authUser);
    if (initialState) {
        const existingCache = _apolloClient.extract();
        _apolloClient.cache.restore(Object.assign(Object.assign({}, existingCache), initialState));
    }
    if (typeof window === "undefined") {
        return _apolloClient;
    }
    if (!apolloClient) {
        apolloClient = _apolloClient;
    }
    return _apolloClient;
};

export function useApollo(initialState, authUser) {
    const store = React.useMemo(() => initializeApollo(initialState, authUser), [initialState, authUser]);
    return store;
}