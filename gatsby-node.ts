import {GraphQLSchema} from "graphql";
import {
    GraphQLAbstractType,
    GraphQLInterfaceType,
    GraphQLList, GraphQLObjectType,
    GraphQLOutputType,
    GraphQLType
} from "graphql/type/definition";
import {
    IGatsbyNodeConfig,
    IGatsbyNodeDefinition,
    IRemoteId,
    ISourcingConfig
} from "gatsby-graphql-source-toolkit/dist/types";
import {CreatePageArgs, NodePluginArgs, Reporter} from "gatsby";

type SourcePluginOptions = {
    concurrency: number,
    debugDir: string,
    fragmentsDir: string,
    typePrefix: string
}

type ModifiedNodeInfo = {
    nodeId: number,
    nodeType: string
}

type WebhookBody = {
    operation: string,
    typeName: string,
    id: number,
    token?: string
}

const fs = require("fs-extra")
const fetch = require("node-fetch")
const path = require("path")
const {print} = require("gatsby/graphql")
const {
    sourceAllNodes,
    sourceNodeChanges,
    createSchemaCustomization,
    generateDefaultFragments,
    compileNodeQueries,
    buildNodeDefinitions,
    wrapQueryExecutorWithQueue,
    loadSchema,
} = require("gatsby-graphql-source-toolkit")
const {isInterfaceType, isListType} = require("graphql")

const craftGqlToken = process.env.CRAFTGQL_TOKEN;
const craftGqlUrl = process.env.CRAFTGQL_URL;

const loadedPluginOptions: SourcePluginOptions = {
    concurrency: 10,
    debugDir: __dirname + "/.cache/craft-graphql-documents",
    fragmentsDir: __dirname + "/.cache/craft-fragments",
    typePrefix: "Craft_",
};

let schema: GraphQLSchema;
let gatsbyNodeTypes: IGatsbyNodeConfig[];
let sourcingConfig: ISourcingConfig & { verbose: boolean };
let previewToken: string|null;
let craftInterfaces: string[] = [];

/**
 * Fetch the schema
 */
async function getSchema() {
    if (!schema) {
        schema = await loadSchema(execute)
    }

    return schema;
}

/**
 * Return a list of all possible Gatsby node types
 */
async function getGatsbyNodeTypes() {
    if (gatsbyNodeTypes) {
        return gatsbyNodeTypes
    }

    const schema = await getSchema();

    const queries = schema.getQueryType()?.getFields();

    if (!queries) {
        return ([]);
    }

    // Check if Craft endpoint has Gatsby plugin installed and enabled.
    if (!queries.sourceNodeInformation) {
        return ([]);
    }

    const queryResponse = await execute({
        operationName: 'sourceNodeData',
        query: 'query sourceNodeData { sourceNodeInformation { node list filterArgument filterTypeExpression  targetInterface } }',
        variables: {}
    });

    if (!(queryResponse.data && queryResponse.data.sourceNodeInformation)) {
        return ([]);
    }

    const sourceNodeInformation = queryResponse.data.sourceNodeInformation;
    const queryMap: { [key: string]: { list: string, node: string, filterArgument?: string, filterTypeExpression?: string } } = {};

    // Loop through returned data and build the query map Craft has provided for us.
    for (let nodeInformation of sourceNodeInformation) {
        queryMap[nodeInformation.targetInterface] = {
            list: nodeInformation.list,
            node: nodeInformation.node
        };

        if (nodeInformation.filterArgument) {
            queryMap[nodeInformation.targetInterface].filterArgument = nodeInformation.filterArgument;
        }

        if (nodeInformation.filterTypeExpression) {
            queryMap[nodeInformation.targetInterface].filterTypeExpression = nodeInformation.filterTypeExpression;
        }

        craftInterfaces.push(nodeInformation.targetInterface);
    }

    /**
     * Helper function that extracts possible Gatsby nodes by interface name
     * @param string  ifaceName
     * @param callable queryListBuilder
     */
    const extractNodesFromInterface = (ifaceName: string, queryListBuilder: (type: string, canBeDraft: boolean) => string): IGatsbyNodeConfig[] => {
        const iface = schema.getType(ifaceName) as GraphQLAbstractType;

        const canBeDraft = (input: unknown): boolean => {
            return typeof input === 'object' && input !== null && '_fields' in input && 'sourceId' in (input as GraphQLObjectType).getFields();
        }

        return !iface ? [] : schema.getPossibleTypes(iface).map(type => {
            return ({
                remoteTypeName: type.name,
                queries: queryListBuilder(type.name, canBeDraft(type)),
            })
        });
    }

    // prettier-ignore
    /**
     * Fragment definition helper
     * @param string typeName
     */
    const fragmentHelper = (typeName: string, canBeDraft: boolean): { fragmentName: string, fragment: string } => {
        const fragmentName = '_Craft' + typeName + 'ID_';
        const idProperty = canBeDraft ? 'sourceId' : 'id';
        return {
            fragmentName: fragmentName,
            fragment: `
            fragment ${fragmentName} on ${typeName} {
                __typename
                ${idProperty}
            }
            `
        };
    };

    gatsbyNodeTypes = [];

    // For all the mapped queries
    for (let [interfaceName, sourceNodeInformation] of Object.entries(queryMap)) {
        // extract all the different types for the interfaces
        gatsbyNodeTypes.push(...extractNodesFromInterface(interfaceName, (typeName, canBeDraft) => {
            let queries = '';
            let fragmentInfo = fragmentHelper(typeName, canBeDraft);

            queries = fragmentInfo.fragment;

            // and define queries for the concrete type
            if (sourceNodeInformation.node) {
                queries += `query NODE_${typeName} { ${sourceNodeInformation.node}(id: $id) { ... ${fragmentInfo.fragmentName}  } }
                `;
            }

            if (sourceNodeInformation.filterArgument) {
                let regexp = new RegExp(sourceNodeInformation.filterTypeExpression as string);
                const matches = typeName.match(regexp);

                if (matches && matches[1]) {
                    let typeFilter = sourceNodeInformation.filterArgument + ': "' + matches[1] + '"';
                    queries += `query LIST_${typeName} { ${sourceNodeInformation.list}(${typeFilter} limit: $limit, offset: $offset) { ... ${fragmentInfo.fragmentName} } }
                    `;
                }
            }

            return queries;
        }));
    }

    return (gatsbyNodeTypes);
}

/**
 * Write default fragments to the disk.
 */
async function writeDefaultFragments() {
    const defaultFragments = generateDefaultFragments({
        schema: await getSchema(),
        gatsbyNodeTypes: await getGatsbyNodeTypes(),
    })

    for (const [remoteTypeName, fragment] of defaultFragments) {
        const filePath = path.join(loadedPluginOptions.fragmentsDir, `${remoteTypeName}.graphql`)

        if (!fs.existsSync(filePath)) {
            await fs.writeFile(filePath, fragment)
        }
    }
}

/**
 * Collect fragments from the disk.
 */
async function collectFragments() {
    const customFragments = []
    for (const fileName of await fs.readdir(loadedPluginOptions.fragmentsDir)) {
        if (/.graphql$/.test(fileName)) {
            const filePath = path.join(loadedPluginOptions.fragmentsDir, fileName)
            const fragment = await fs.readFile(filePath)
            customFragments.push(fragment.toString())
        }
    }
    return customFragments
}

/**
 * Write the compiled sourcing queries to the disk
 * @param nodeDocs
 */
async function writeCompiledQueries(nodeDocs: IGatsbyNodeDefinition[]) {
    // @ts-ignore
    for (const [remoteTypeName, document] of nodeDocs) {
        await fs.writeFile(loadedPluginOptions.debugDir + `/${remoteTypeName}.graphql`, print(document))
    }
}

/**
 * Execute a GraphQL query
 * @param operation
 */
async function execute(operation: { operationName: string, query: string, variables: object }) {
    let {operationName, query, variables = {}} = operation;

    const headers: { [key: string]: string } = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${craftGqlToken}`,
    };

    // Set the token, if it exists
    if (previewToken) {
        headers['X-Craft-Token'] = previewToken;
    }

    const res = await fetch(craftGqlUrl, {
        method: "POST",
        body: JSON.stringify({query, variables, operationName}),
        headers
    });

    // Aaaand remove the token for subsequent requests
    previewToken = null;

    return await res.json()
}

exports.onPreBootstrap = async (gatsbyApi: NodePluginArgs, pluginOptions: SourcePluginOptions) => {
    // Set all the config settings pre-bootstrap
    loadedPluginOptions.concurrency = pluginOptions.concurrency ?? loadedPluginOptions.concurrency;
    loadedPluginOptions.debugDir = pluginOptions.debugDir ?? loadedPluginOptions.debugDir;
    loadedPluginOptions.fragmentsDir = pluginOptions.fragmentsDir ?? loadedPluginOptions.fragmentsDir;
    loadedPluginOptions.typePrefix = pluginOptions.typePrefix ?? loadedPluginOptions.typePrefix;

    // Make sure the folders exists
    await fs.ensureDir(loadedPluginOptions.debugDir)
    await fs.ensureDir(loadedPluginOptions.fragmentsDir)

    // Make sure the fragments exist
    await ensureFragmentsExist(gatsbyApi.reporter)
}

exports.createSchemaCustomization = async (gatsbyApi: NodePluginArgs) => {
    const config = await getSourcingConfig(gatsbyApi)
    const { createTypes } = gatsbyApi.actions;

    let typeDefs = '';

    for (let craftInterface of craftInterfaces) {
        typeDefs += `
            interface ${loadedPluginOptions.typePrefix}${craftInterface} @nodeInterface { 
                id: ID! 
            }
        `
    }

    createTypes(typeDefs);

    await createSchemaCustomization(config)
}

// Source the actual Gatsby nodes
exports.sourceNodes = async (gatsbyApi: NodePluginArgs) => {
    const {cache, reporter, webhookBody} = gatsbyApi
    const config = await getSourcingConfig(gatsbyApi)

    // If this is a webhook call
    if (webhookBody && typeof webhookBody == "object" && Object.keys(webhookBody).length) {
        reporter.info("Processing webhook.");
        const nodeEvent = (webhookBody: WebhookBody) => {
            const {operation, typeName, id} = webhookBody;
            let eventName = '';

            switch (operation) {
                case 'delete':
                    eventName = 'DELETE';
                    break;
                case 'update':
                    eventName = 'UPDATE';
                    break;
            }

            previewToken = webhookBody.token ?? null;

            // Create the node event
            return {
                eventName,
                remoteTypeName: typeName,
                remoteId: {id, __typename: typeName},
            }
        }

        // And source it
        await sourceNodeChanges(config, {
            nodeEvents: [nodeEvent(webhookBody as WebhookBody)],
        })

        return;
    }

    reporter.info("Checking Craft config version.");

    const {data} = await execute({
        operationName: 'craftState',
        query: 'query craftState { configVersion  lastUpdateTime}',
        variables: {}
    });

    const remoteConfigVersion = data.configVersion;
    const remoteContentUpdateTime = data.lastUpdateTime;

    const localConfigVersion = (await cache.get(`CRAFT_CONFIG_VERSION`)) || '';
    const localContentUpdateTime = (await cache.get(`CRAFT_LAST_CONTENT_UPDATE`)) || '';

    // If either project config changed or we don't have cached content, source it all
    if (remoteConfigVersion !== localConfigVersion || !localContentUpdateTime) {
        reporter.info("Cached content is unavailable or outdated, sourcing _all_ nodes.");
        await sourceAllNodes(config)
    } else {
        reporter.info(`Craft config version has not changed since last sourcing. Checking for content changes since "${localContentUpdateTime}".`);

        // otherwise, check for changed and deleted content.
        const {data} = await execute({
            operationName: 'nodeChanges',
            query: `query nodeChanges {  
                nodesUpdatedSince (since: "${localContentUpdateTime}") { nodeId nodeType }
                nodesDeletedSince (since: "${localContentUpdateTime}") { nodeId nodeType }
            }`,
            variables: {}
        });

        const updatedNodes = data.nodesUpdatedSince as ModifiedNodeInfo[];
        const deletedNodes = data.nodesDeletedSince as ModifiedNodeInfo[];

        // Create the sourcing node events
        const nodeEvents = [
            ...updatedNodes.map(entry => {
                return {
                    eventName: 'UPDATE',
                    remoteTypeName: entry.nodeType,
                    remoteId: {__typename: entry.nodeType, id: entry.nodeId}
                };
            }),
            ...deletedNodes.map(entry => {
                return {
                    eventName: 'DELETE',
                    remoteTypeName: entry.nodeType,
                    remoteId: {__typename: entry.nodeType, id: entry.nodeId}
                };
            })
        ];

        if (nodeEvents.length) {
            reporter.info("Sourcing changes for " + nodeEvents.length + " nodes.");
        } else {
            reporter.info("No content changes found.");
        }

        // And source, if needed
        await sourceNodeChanges(config, {nodeEvents})
    }

    await cache.set(`CRAFT_CONFIG_VERSION`, remoteConfigVersion);
    await cache.set(`CRAFT_LAST_CONTENT_UPDATE`, remoteContentUpdateTime);
}

async function getSourcingConfig(gatsbyApi: NodePluginArgs) {
    if (sourcingConfig) {
        return sourcingConfig
    }
    const schema = await getSchema()
    const gatsbyNodeTypes = await getGatsbyNodeTypes()

    const documents = await compileNodeQueries({
        schema,
        gatsbyNodeTypes,
        customFragments: await collectFragments(),
    })

    await writeCompiledQueries(documents)

    return (sourcingConfig = {
        gatsbyApi,
        schema,
        gatsbyNodeDefs: buildNodeDefinitions({gatsbyNodeTypes, documents}),
        gatsbyTypePrefix: loadedPluginOptions.typePrefix,
        execute: wrapQueryExecutorWithQueue(execute, {concurrency: loadedPluginOptions.concurrency}),
        verbose: true,
    })
}

async function ensureFragmentsExist(reporter: Reporter) {
    const fragmentDir = loadedPluginOptions.fragmentsDir;
    const fragments = await fs.readdir(fragmentDir);

    if (fragments.length == 0) {
        reporter.info("No fragments found, writing default fragments.")
        await writeDefaultFragments();
    } else {
        reporter.info(fragments.length + " fragments found, skipping writing default fragments")
    }
}
