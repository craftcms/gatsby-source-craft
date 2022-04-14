"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const gatsby_source_filesystem_1 = require("gatsby-source-filesystem");
const p_retry_1 = __importDefault(require("p-retry"));
const fs = require("fs-extra");
const fetch = require("node-fetch");
const path = require("path");
const { print } = require("gatsby/graphql");
const { sourceAllNodes, sourceNodeChanges, createSchemaCustomization, generateDefaultFragments, compileNodeQueries, buildNodeDefinitions, wrapQueryExecutorWithQueue, loadSchema, } = require("gatsby-graphql-source-toolkit");
const loadedPluginOptions = {
    craftGqlToken: process.env.CRAFTGQL_TOKEN + "",
    craftGqlUrl: process.env.CRAFTGQL_URL + "",
    concurrency: 10,
    debugDir: __dirname + "/.cache/craft-graphql-documents",
    fragmentsDir: __dirname + "/.cache/craft-fragments",
    typePrefix: "Craft_",
    looseInterfaces: false,
    sourcingParams: {},
    enabledSites: null,
    verbose: false,
    retryOptions: { retries: 1 },
};
const internalFragmentDir = __dirname + "/.cache/internal-craft-fragments";
let schema;
let gatsbyNodeTypes;
let sourcingConfig;
let previewToken;
let craftInterfaces = [];
let craftTypesByInterface = {};
let craftFieldsByInterface = {};
let craftPrimarySiteId = '';
let craftEnabledSites = '';
let remoteConfigVersion = '';
let lastUpdateTime = '';
let gatsbyHelperVersion = '';
let craftGqlTypePrefix = '';
let craftVersion = '';
let craftElementIdField = 'sourceId';
/**
 * Fetch the schema
 */
async function getSchema() {
    if (!schema) {
        schema = await loadSchema(execute);
    }
    return schema;
}
/**
 * Return a list of all possible Gatsby node types
 */
async function getGatsbyNodeTypes(reporter) {
    if (!craftVersion.length) {
        reporter.error('Unable to source nodes!');
        return ([]);
    }
    if (gatsbyNodeTypes) {
        return gatsbyNodeTypes;
    }
    const schema = await getSchema();
    gatsbyNodeTypes = [];
    const queryResponse = await execute({
        operationName: 'sourceNodeData',
        query: `query sourceNodeData { 
            sourceNodeInformation { 
                node 
                list 
                filterArgument 
                filterTypeExpression 
                targetInterface 
            } 
        }`,
        variables: {},
        additionalHeaders: {
            "X-Craft-Gql-Cache": "no-cache"
        }
    });
    if (!(queryResponse.data && queryResponse.data.sourceNodeInformation)) {
        return ([]);
    }
    const sourceNodeInformation = queryResponse.data.sourceNodeInformation;
    const queryMap = {};
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
    const extractNodesFromInterface = (ifaceName, queryListBuilder) => {
        const iface = schema.getType(ifaceName);
        if (!iface) {
            return [];
        }
        for (let field of Object.values(iface.getFields())) {
            if (craftFieldsByInterface[ifaceName]) {
                craftFieldsByInterface[ifaceName].push(field);
            }
            else {
                craftFieldsByInterface[ifaceName] = [field];
            }
        }
        const canBeDraft = (input) => {
            return typeof input === 'object' && input !== null && '_fields' in input && craftElementIdField in input.getFields();
        };
        return schema.getPossibleTypes(iface).map(type => {
            if (craftTypesByInterface[ifaceName]) {
                craftTypesByInterface[ifaceName].push(type);
            }
            else {
                craftTypesByInterface[ifaceName] = [type];
            }
            return ({
                remoteTypeName: type.name,
                queries: queryListBuilder(type.name, canBeDraft(type)),
                nodeQueryVariables: id => {
                    var _a;
                    const idValue = (_a = id.sourceId) !== null && _a !== void 0 ? _a : id.id;
                    return {
                        id: idValue,
                        siteId: id.siteId
                    };
                }
            });
        });
    };
    // prettier-ignore
    /**
     * Fragment definition helper
     * @param string typeName
     */
    const fragmentHelper = (typeName, canBeDraft) => {
        const fragmentName = '_Craft' + typeName + 'ID_';
        const idProperty = canBeDraft ? craftElementIdField : 'id';
        return {
            fragmentName: fragmentName,
            fragment: `
            fragment ${fragmentName} on ${typeName} {
                __typename
                ${idProperty}
                siteId
            }
            `
        };
    };
    if (loadedPluginOptions.enabledSites) {
        if (typeof loadedPluginOptions.enabledSites == "object") {
            craftEnabledSites = `["${loadedPluginOptions.enabledSites.join('", "')}"]`;
        }
        else {
            craftEnabledSites = `"${loadedPluginOptions.enabledSites}"`;
        }
    }
    else {
        craftEnabledSites = `"${craftPrimarySiteId}"`;
    }
    // For all the mapped queries
    for (let [interfaceName, sourceNodeInformation] of Object.entries(queryMap)) {
        // extract all the different types for the interfaces
        gatsbyNodeTypes.push(...extractNodesFromInterface(interfaceName, (typeName, canBeDraft) => {
            let queries = '';
            let fragmentInfo = fragmentHelper(typeName, canBeDraft);
            queries = fragmentInfo.fragment;
            // and define queries for the concrete type
            if (sourceNodeInformation.node) {
                queries += `query NODE_${typeName} { ${sourceNodeInformation.node}(id: $id siteId: $siteId status: null) { ... ${fragmentInfo.fragmentName}  } }
                `;
            }
            let typeFilter = '';
            if (sourceNodeInformation.filterArgument) {
                let regexp = new RegExp(sourceNodeInformation.filterTypeExpression);
                const matches = typeName.match(regexp);
                if (matches && matches[1]) {
                    typeFilter = sourceNodeInformation.filterArgument + ': "' + matches[1] + '"';
                }
            }
            // Add sourcing parameters defined by user to the sourcing queries
            let configuredParameters = {};
            // Interfaces first
            if (interfaceName in loadedPluginOptions.sourcingParams) {
                configuredParameters = Object.assign(configuredParameters, loadedPluginOptions.sourcingParams[interfaceName]);
            }
            // More specific implementations next
            if (typeName in loadedPluginOptions.sourcingParams) {
                configuredParameters = Object.assign(configuredParameters, loadedPluginOptions.sourcingParams[typeName]);
            }
            // Convert all of that to a string
            let configuredParameterString = '';
            for (const [key, value] of Object.entries(configuredParameters)) {
                configuredParameterString += `${key}: ${value} `;
            }
            queries += `query LIST_${typeName} { ${sourceNodeInformation.list}(${typeFilter} limit: $limit, offset: $offset site: ${craftEnabledSites} ${configuredParameterString}) { ... ${fragmentInfo.fragmentName} } }
            `;
            return queries;
        }));
    }
    return (gatsbyNodeTypes);
}
/**
 * Write default fragments to the disk.
 */
async function writeDefaultFragments(reporter) {
    const defaultFragments = generateDefaultFragments({
        schema: await getSchema(),
        gatsbyNodeTypes: await getGatsbyNodeTypes(reporter),
    });
    await fs.ensureDir(internalFragmentDir);
    for (const [remoteTypeName, fragment] of defaultFragments) {
        const filePath = path.join(internalFragmentDir, `${remoteTypeName}.graphql`);
        if (!fs.existsSync(filePath)) {
            await fs.writeFile(filePath, fragment);
        }
    }
}
async function addExtraFragments(reporter) {
    const fragmentDir = loadedPluginOptions.fragmentsDir;
    const fragments = await fs.readdir(fragmentDir);
    const mandatoryFragments = {
        ensureRemoteId: `fragment RequiredEntryFields on ${craftGqlTypePrefix}EntryInterface { id }`
    };
    // Add mandatory fragments
    for (let [fragmentName, fragmentBody] of Object.entries(mandatoryFragments)) {
        fragmentName += '.graphql';
        const filePath = path.join(internalFragmentDir, fragmentName);
        fs.writeFile(filePath, fragmentBody);
    }
    reporter.info("Found " + fragments.length + " additional fragments");
    // Look at the configured folder
    // Otherwise, copy it to the internal folder, maybe overwriting a default fragment
    for (const fragmentFile of fragments) {
        const extraFile = path.join(fragmentDir, fragmentFile);
        const existingFile = path.join(internalFragmentDir, fragmentFile);
        const stats = fs.statSync(extraFile);
        const fileSizeInBytes = stats["size"];
        if (fs.existsSync(existingFile)) {
            reporter.info("Overwriting the " + fragmentFile + " fragment");
        }
        else {
            reporter.info("Adding " + fragmentFile + " to additional fragments");
        }
        fs.copyFileSync(extraFile, existingFile);
    }
}
/**
 * Collect fragments from the disk.
 */
async function collectFragments() {
    const customFragments = [];
    for (const fileName of await fs.readdir(internalFragmentDir)) {
        if (/.graphql$/.test(fileName)) {
            const filePath = path.join(internalFragmentDir, fileName);
            const fragment = await fs.readFile(filePath);
            customFragments.push(fragment.toString());
        }
    }
    return customFragments;
}
/**
 * Write the compiled sourcing queries to the disk
 * @param nodeDocs
 */
async function writeCompiledQueries(nodeDocs) {
    // @ts-ignore
    for (const [remoteTypeName, document] of nodeDocs) {
        await fs.writeFile(loadedPluginOptions.debugDir + `/${remoteTypeName}.graphql`, print(document));
    }
}
/**
 * Execute a GraphQL query
 * @param operation
 */
async function execute(operation) {
    var _a, _b;
    let { operationName, query, variables = {}, additionalHeaders = {} } = operation;
    const headers = Object.assign(Object.assign(Object.assign({}, ((_b = (_a = loadedPluginOptions.fetchOptions) === null || _a === void 0 ? void 0 : _a.headers) !== null && _b !== void 0 ? _b : {})), { "Content-Type": "application/json", Authorization: `Bearer ${loadedPluginOptions.craftGqlToken}` }), additionalHeaders);
    // Set the token, if it exists
    if (previewToken) {
        headers["X-Craft-Token"] = previewToken;
    }
    const res = await p_retry_1.default(() => fetch(loadedPluginOptions.craftGqlUrl, Object.assign(Object.assign({}, loadedPluginOptions.fetchOptions), { method: "POST", body: JSON.stringify({ query, variables, operationName }), headers })), loadedPluginOptions.retryOptions);
    // Aaaand remove the token for subsequent requests
    previewToken = null;
    return await res.json();
}
exports.onPreBootstrap = async (gatsbyApi, pluginOptions) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    // Set all the config settings pre-bootstrap
    loadedPluginOptions.craftGqlUrl = (_a = pluginOptions.craftGqlUrl) !== null && _a !== void 0 ? _a : loadedPluginOptions.craftGqlUrl;
    loadedPluginOptions.craftGqlToken = (_b = pluginOptions.craftGqlToken) !== null && _b !== void 0 ? _b : loadedPluginOptions.craftGqlToken;
    loadedPluginOptions.concurrency = (_c = pluginOptions.concurrency) !== null && _c !== void 0 ? _c : loadedPluginOptions.concurrency;
    loadedPluginOptions.debugDir = (_d = pluginOptions.debugDir) !== null && _d !== void 0 ? _d : loadedPluginOptions.debugDir;
    loadedPluginOptions.fragmentsDir = (_e = pluginOptions.fragmentsDir) !== null && _e !== void 0 ? _e : loadedPluginOptions.fragmentsDir;
    loadedPluginOptions.typePrefix = (_f = pluginOptions.typePrefix) !== null && _f !== void 0 ? _f : loadedPluginOptions.typePrefix;
    loadedPluginOptions.looseInterfaces = (_g = pluginOptions.looseInterfaces) !== null && _g !== void 0 ? _g : loadedPluginOptions.looseInterfaces;
    loadedPluginOptions.sourcingParams = (_h = pluginOptions.sourcingParams) !== null && _h !== void 0 ? _h : loadedPluginOptions.sourcingParams;
    loadedPluginOptions.enabledSites = (_j = pluginOptions.enabledSites) !== null && _j !== void 0 ? _j : loadedPluginOptions.enabledSites;
    loadedPluginOptions.verbose = (_k = pluginOptions.verbose) !== null && _k !== void 0 ? _k : loadedPluginOptions.verbose;
    loadedPluginOptions.fetchOptions = (_l = pluginOptions.fetchOptions) !== null && _l !== void 0 ? _l : loadedPluginOptions.fetchOptions;
    loadedPluginOptions.retryOptions = (_m = pluginOptions.retryOptions) !== null && _m !== void 0 ? _m : loadedPluginOptions.retryOptions;
    // Make sure the folders exists
    await fs.ensureDir(loadedPluginOptions.debugDir);
    await fs.ensureDir(loadedPluginOptions.fragmentsDir);
    // Fetch the meta data
    const reporter = gatsbyApi.reporter;
    reporter.info("Querying for Craft state.");
    const schema = await getSchema();
    const queries = (_o = schema.getQueryType()) === null || _o === void 0 ? void 0 : _o.getFields();
    if (!queries) {
        reporter.info("Unable to fetch Craft schema.");
        return;
    }
    // Check if Craft endpoint has Gatsby plugin installed and enabled.
    if (!queries.sourceNodeInformation) {
        reporter.info("Gatsby Helper not found on target Craft site.");
        return;
    }
    if (!queries.craftVersion) {
        reporter.info("Gatsby Helper plugin must be at least version 1.1.0 or greater.");
    }
    const { data } = await execute({
        operationName: 'craftState',
        query: `query craftState { 
            configVersion 
            lastUpdateTime 
            primarySiteId
            gatsbyHelperVersion
            gqlTypePrefix 
            craftVersion
        }`,
        variables: {},
        additionalHeaders: {
            "X-Craft-Gql-Cache": "no-cache"
        }
    });
    remoteConfigVersion = data.configVersion;
    lastUpdateTime = data.lastUpdateTime;
    craftGqlTypePrefix = data.gqlTypePrefix;
    gatsbyHelperVersion = data.gatsbyHelperVersion;
    craftPrimarySiteId = data.primarySiteId;
    craftVersion = data.craftVersion;
    // Avoid deprecation errors
    if (craftVersion >= '3.7.0') {
        console.log('Switch to canonical?');
        craftElementIdField = 'canonicalId';
    }
    reporter.info(`Craft v${craftVersion}, running Helper plugin v${gatsbyHelperVersion}`);
    // Make sure the fragments exist
    await ensureFragmentsExist(reporter);
};
exports.createSchemaCustomization = async (gatsbyApi) => {
    const config = await getSourcingConfig(gatsbyApi);
    const { createTypes } = gatsbyApi.actions;
    let typeDefs = '';
    for (let craftInterface of craftInterfaces) {
        let extraFields = {};
        let extraFieldsAsString = '';
        let redefineTypes = '';
        const extractFieldType = (field, onlyNullable) => {
            const fieldName = field.name;
            const skippedTypes = ['id', 'parent', 'children', 'next', 'prev'];
            // If skipped type or begins with an underscore
            if (skippedTypes.includes(fieldName) || fieldName.charAt(0) === '_') {
                return false;
            }
            let fieldType = field.type.toString();
            // If only nullable and is non-nullable
            if (onlyNullable && fieldType.slice(-1) == '!') {
                return false;
            }
            // If any arguments are required, can't have it.
            for (let fieldArgument of field.args) {
                if (fieldArgument.type.toString().slice(-1) == '!') {
                    return false;
                }
            }
            // Convert Craft's DateTime to Gatsby's Date.
            fieldType = fieldType.replace(new RegExp(craftGqlTypePrefix + 'DateTime'), 'JSON');
            if (fieldType.match(/(Int|Float|String|Boolean|ID|JSON)(\]|!|$)/)) {
                return fieldType;
            }
            return fieldType.replace(/^([^a-z]+)?([a-z_]+)([^a-z]+)?$/i, '$1' + loadedPluginOptions.typePrefix + '$2$3');
        };
        // For all interfaces
        if (craftTypesByInterface[craftInterface]) {
            if (loadedPluginOptions.looseInterfaces) {
                // Collect all fields across all implementations of the interface if loose interfaces are enabled
                for (let gqlType of craftTypesByInterface[craftInterface]) {
                    for (let field of Object.values(gqlType.getFields())) {
                        let extractedType = extractFieldType(field, true);
                        if (extractedType) {
                            extraFields[field.name] = extractedType;
                        }
                    }
                }
            }
            else if (craftFieldsByInterface[craftInterface]) {
                // Otherwise just collect the interface fields
                for (let field of Object.values(craftFieldsByInterface[craftInterface])) {
                    let extractedType = extractFieldType(field, false);
                    if (extractedType) {
                        extraFields[field.name] = extractedType;
                    }
                }
            }
            // Create a string of all the fields we found.
            for (let [fieldName, fieldType] of Object.entries(extraFields)) {
                extraFieldsAsString += `${fieldName}: ${fieldType}
            `;
            }
            // If loose interfaces are enabled, redefine the types, too.
            if (loadedPluginOptions.looseInterfaces) {
                // And now redefine all the implementations to have all the fields.
                for (let gqlType of craftTypesByInterface[craftInterface]) {
                    redefineTypes += `type ${loadedPluginOptions.typePrefix}${gqlType.name} {
                        id: ID!
                        ${extraFieldsAsString}
                    }`;
                }
            }
        }
        typeDefs += `
            interface ${loadedPluginOptions.typePrefix}${craftInterface} implements Node { 
                id: ID!
                ${extraFieldsAsString}
            }
            
            ${redefineTypes}
        `;
    }
    createTypes(typeDefs);
    await createSchemaCustomization(config);
};
// @ts-ignore
// Add `localFile` nodes to assets.
exports.createResolvers = async ({ createResolvers, intermediateSchema, actions, cache, createNodeId, store, reporter }) => {
    const { createNode } = actions;
    const ifaceName = `${loadedPluginOptions.typePrefix + craftGqlTypePrefix}AssetInterface`;
    const iface = intermediateSchema.getType(ifaceName);
    if (iface) {
        const possibleTypes = intermediateSchema.getPossibleTypes(iface);
        const resolvers = {};
        for (const assetType of possibleTypes) {
            resolvers[assetType.name] = {
                localFile: {
                    type: `File`,
                    async resolve(source) {
                        if (source.url) {
                            return await gatsby_source_filesystem_1.createRemoteFileNode({
                                url: encodeURI(source.url),
                                store,
                                cache,
                                createNode,
                                createNodeId,
                                reporter
                            });
                        }
                    },
                },
            };
        }
        createResolvers(resolvers);
    }
};
// Source the actual Gatsby nodes
exports.sourceNodes = async (gatsbyApi) => {
    const { cache, reporter, webhookBody } = gatsbyApi;
    const config = await getSourcingConfig(gatsbyApi);
    // If this is a webhook call
    if (webhookBody && typeof webhookBody == "object" && Object.keys(webhookBody).length) {
        reporter.info("Processing webhook.");
        const nodeEvent = (webhookBody) => {
            var _a;
            const { operation, typeName, id, siteId } = webhookBody;
            let eventName = '';
            switch (operation) {
                case 'delete':
                    eventName = 'DELETE';
                    break;
                case 'update':
                    eventName = 'UPDATE';
                    break;
            }
            previewToken = (_a = webhookBody.token) !== null && _a !== void 0 ? _a : null;
            // Create the node event
            return {
                eventName,
                remoteTypeName: typeName,
                remoteId: { id, __typename: typeName, siteId },
            };
        };
        // And source it
        await sourceNodeChanges(config, {
            nodeEvents: [nodeEvent(webhookBody)],
        });
        return;
    }
    const localConfigVersion = (await cache.get(`CRAFT_CONFIG_VERSION`)) || '';
    const localContentUpdateTime = (await cache.get(`CRAFT_LAST_CONTENT_UPDATE`)) || '';
    // If either project config changed or we don't have cached content, source it all
    if (remoteConfigVersion !== localConfigVersion || !localContentUpdateTime) {
        reporter.info("Cached content is unavailable or outdated, sourcing _all_ nodes.");
        await sourceAllNodes(config);
    }
    else {
        reporter.info(`Craft config version has not changed since last sourcing. Checking for content changes since "${localContentUpdateTime}".`);
        // otherwise, check for changed and deleted content.
        const { data } = await execute({
            operationName: 'nodeChanges',
            query: `query nodeChanges {  
                nodesUpdatedSince (since: "${localContentUpdateTime}" site: ${craftEnabledSites}) { nodeId nodeType siteId}
                nodesDeletedSince (since: "${localContentUpdateTime}") { nodeId nodeType siteId}
            }`,
            variables: {},
            additionalHeaders: {
                "X-Craft-Gql-Cache": "no-cache"
            }
        });
        const updatedNodes = data.nodesUpdatedSince;
        const deletedNodes = data.nodesDeletedSince;
        // Create the sourcing node events
        const nodeEvents = [
            ...updatedNodes.map(entry => {
                return {
                    eventName: 'UPDATE',
                    remoteTypeName: entry.nodeType,
                    remoteId: { __typename: entry.nodeType, id: entry.nodeId, siteId: entry.siteId }
                };
            }),
            ...deletedNodes.map(entry => {
                return {
                    eventName: 'DELETE',
                    remoteTypeName: entry.nodeType,
                    remoteId: { __typename: entry.nodeType, id: entry.nodeId, siteId: entry.siteId }
                };
            })
        ];
        if (nodeEvents.length) {
            reporter.info("Sourcing changes for " + nodeEvents.length + " nodes.");
        }
        else {
            reporter.info("No content changes found.");
        }
        // And source, if needed
        await sourceNodeChanges(config, { nodeEvents });
    }
    await cache.set(`CRAFT_CONFIG_VERSION`, remoteConfigVersion);
    await cache.set(`CRAFT_LAST_CONTENT_UPDATE`, lastUpdateTime);
};
async function getSourcingConfig(gatsbyApi) {
    if (sourcingConfig) {
        return sourcingConfig;
    }
    const schema = await getSchema();
    const gatsbyNodeTypes = await getGatsbyNodeTypes(gatsbyApi.reporter);
    const documents = await compileNodeQueries({
        schema,
        gatsbyNodeTypes,
        customFragments: await collectFragments(),
    });
    await writeCompiledQueries(documents);
    return (sourcingConfig = {
        gatsbyApi,
        schema,
        gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes, documents }),
        gatsbyTypePrefix: loadedPluginOptions.typePrefix,
        execute: wrapQueryExecutorWithQueue(execute, { concurrency: loadedPluginOptions.concurrency }),
        verbose: loadedPluginOptions.verbose,
    });
}
async function ensureFragmentsExist(reporter) {
    reporter.info("Clearing previous fragments.");
    await fs.remove(internalFragmentDir, { recursive: true });
    reporter.info("Writing default fragments.");
    await writeDefaultFragments(reporter);
    await addExtraFragments(reporter);
}
