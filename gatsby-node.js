"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gatsby_source_filesystem_1 = require("gatsby-source-filesystem");
const fs = require("fs-extra");
const fetch = require("node-fetch");
const path = require("path");
const { print } = require("gatsby/graphql");
const { sourceAllNodes, sourceNodeChanges, createSchemaCustomization, generateDefaultFragments, compileNodeQueries, buildNodeDefinitions, wrapQueryExecutorWithQueue, loadSchema, } = require("gatsby-graphql-source-toolkit");
const { isInterfaceType, isListType } = require("graphql");
const craftGqlToken = process.env.CRAFTGQL_TOKEN;
const craftGqlUrl = process.env.CRAFTGQL_URL;
const loadedPluginOptions = {
    concurrency: 10,
    debugDir: __dirname + "/.cache/craft-graphql-documents",
    fragmentsDir: __dirname + "/.cache/craft-fragments",
    typePrefix: "Craft_",
    looseInterfaces: false,
    sourcingParams: {},
    enabledSites: null
};
const internalFragmentDir = __dirname + "/.cache/internal-craft-fragments";
const mandatoryFragments = {
    ensureRemoteId: 'fragment RequiredEntryFields on EntryInterface { id }'
};
let schema;
let gatsbyNodeTypes;
let sourcingConfig;
let previewToken;
let craftInterfaces = [];
let craftTypesByInterface = {};
let craftFieldsByInterface = {};
let craftPrimarySiteId = '';
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
async function getGatsbyNodeTypes() {
    var _a;
    if (gatsbyNodeTypes) {
        return gatsbyNodeTypes;
    }
    const schema = await getSchema();
    const queries = (_a = schema.getQueryType()) === null || _a === void 0 ? void 0 : _a.getFields();
    if (!queries) {
        return ([]);
    }
    // Check if Craft endpoint has Gatsby plugin installed and enabled.
    if (!queries.sourceNodeInformation) {
        return ([]);
    }
    const queryResponse = await execute({
        operationName: 'sourceNodeData',
        query: 'query sourceNodeData { sourceNodeInformation { node list filterArgument filterTypeExpression targetInterface } primarySiteId }',
        variables: {},
        additionalHeaders: {
            "X-Craft-Gql-Cache": "no-cache"
        }
    });
    if (!(queryResponse.data && queryResponse.data.sourceNodeInformation)) {
        return ([]);
    }
    craftPrimarySiteId = queryResponse.data.primarySiteId;
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
            return typeof input === 'object' && input !== null && '_fields' in input && 'sourceId' in input.getFields();
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
        const idProperty = canBeDraft ? 'sourceId' : 'id';
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
    gatsbyNodeTypes = [];
    let craftSites = '';
    if (loadedPluginOptions.enabledSites) {
        if (typeof loadedPluginOptions.enabledSites == "object") {
            craftSites = `["${loadedPluginOptions.enabledSites.join('", "')}"]`;
        }
        else {
            craftSites = `"${loadedPluginOptions.enabledSites}"`;
        }
    }
    else {
        craftSites = `"${craftPrimarySiteId}"`;
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
                queries += `query NODE_${typeName} { ${sourceNodeInformation.node}(id: $id siteId: $siteId) { ... ${fragmentInfo.fragmentName}  } }
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
            queries += `query LIST_${typeName} { ${sourceNodeInformation.list}(${typeFilter} limit: $limit, offset: $offset site: ${craftSites} ${configuredParameterString}) { ... ${fragmentInfo.fragmentName} } }
            `;
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
    let { operationName, query, variables = {}, additionalHeaders = {} } = operation;
    const headers = Object.assign({ "Content-Type": "application/json", Authorization: `Bearer ${craftGqlToken}` }, additionalHeaders);
    // Set the token, if it exists
    if (previewToken) {
        headers['X-Craft-Token'] = previewToken;
    }
    const res = await fetch(craftGqlUrl, {
        method: "POST",
        body: JSON.stringify({ query, variables, operationName }),
        headers
    });
    // Aaaand remove the token for subsequent requests
    previewToken = null;
    return await res.json();
}
exports.onPreBootstrap = async (gatsbyApi, pluginOptions) => {
    var _a, _b, _c, _d, _e, _f, _g;
    // Set all the config settings pre-bootstrap
    loadedPluginOptions.concurrency = (_a = pluginOptions.concurrency) !== null && _a !== void 0 ? _a : loadedPluginOptions.concurrency;
    loadedPluginOptions.debugDir = (_b = pluginOptions.debugDir) !== null && _b !== void 0 ? _b : loadedPluginOptions.debugDir;
    loadedPluginOptions.fragmentsDir = (_c = pluginOptions.fragmentsDir) !== null && _c !== void 0 ? _c : loadedPluginOptions.fragmentsDir;
    loadedPluginOptions.typePrefix = (_d = pluginOptions.typePrefix) !== null && _d !== void 0 ? _d : loadedPluginOptions.typePrefix;
    loadedPluginOptions.looseInterfaces = (_e = pluginOptions.looseInterfaces) !== null && _e !== void 0 ? _e : loadedPluginOptions.looseInterfaces;
    loadedPluginOptions.sourcingParams = (_f = pluginOptions.sourcingParams) !== null && _f !== void 0 ? _f : loadedPluginOptions.sourcingParams;
    loadedPluginOptions.enabledSites = (_g = pluginOptions.enabledSites) !== null && _g !== void 0 ? _g : loadedPluginOptions.enabledSites;
    // Make sure the folders exists
    await fs.ensureDir(loadedPluginOptions.debugDir);
    await fs.ensureDir(loadedPluginOptions.fragmentsDir);
    // Make sure the fragments exist
    await ensureFragmentsExist(gatsbyApi.reporter);
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
            if (onlyNullable && fieldType.charAt(-1) == '!') {
                return false;
            }
            // Convert Craft's DateTime to Gatsby's Date.
            fieldType = fieldType.replace(/DateTime/, 'JSON');
            if (fieldType.match(/(Int|Float|String|Boolean|ID|JSON)(\]|!\]|$)/)) {
                return fieldType;
            }
            return fieldType.replace(/^([^a-z]+)?([a-z_]+)([^a-z]+)?$/i, '$1' + loadedPluginOptions.typePrefix + '$2$3');
        };
        if (craftTypesByInterface[craftInterface]) {
            if (loadedPluginOptions.looseInterfaces) {
                // Collect all fields across all implementations of the interface
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
                for (let field of Object.values(craftFieldsByInterface[craftInterface])) {
                    let extractedType = extractFieldType(field, false);
                    if (extractedType) {
                        extraFields[field.name] = extractedType;
                    }
                }
            }
            // Combine into one large field-defining-string
            for (let [fieldName, fieldType] of Object.entries(extraFields)) {
                extraFieldsAsString += `${fieldName}: ${fieldType}
            `;
            }
            // And now redefine all the implementations to have all the fields.
            for (let gqlType of craftTypesByInterface[craftInterface]) {
                redefineTypes += `type ${loadedPluginOptions.typePrefix}${gqlType.name} {
                id: ID!
                ${extraFieldsAsString}
            }
            `;
            }
        }
        typeDefs += `
            interface ${loadedPluginOptions.typePrefix}${craftInterface} @nodeInterface { 
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
    const ifaceName = loadedPluginOptions.typePrefix + 'AssetInterface';
    const iface = intermediateSchema.getType(ifaceName);
    const possibleTypes = intermediateSchema.getPossibleTypes(iface);
    const resolvers = {};
    for (const assetType of possibleTypes) {
        resolvers[assetType] = {
            localFile: {
                type: `File`,
                async resolve(source) {
                    if (source.url) {
                        return await gatsby_source_filesystem_1.createRemoteFileNode({
                            url: source.url,
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
    reporter.info("Checking Craft config version.");
    const { data } = await execute({
        operationName: 'craftState',
        query: 'query craftState { configVersion lastUpdateTime }',
        variables: {},
        additionalHeaders: {
            "X-Craft-Gql-Cache": "no-cache"
        }
    });
    const remoteConfigVersion = data.configVersion;
    const remoteContentUpdateTime = data.lastUpdateTime;
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
                nodesUpdatedSince (since: "${localContentUpdateTime}") { nodeId nodeType siteId}
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
    await cache.set(`CRAFT_LAST_CONTENT_UPDATE`, remoteContentUpdateTime);
};
async function getSourcingConfig(gatsbyApi) {
    if (sourcingConfig) {
        return sourcingConfig;
    }
    const schema = await getSchema();
    const gatsbyNodeTypes = await getGatsbyNodeTypes();
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
        verbose: true,
    });
}
async function ensureFragmentsExist(reporter) {
    reporter.info("Clearing previous fragments.");
    await fs.remove(internalFragmentDir, { recursive: true });
    reporter.info("Writing default fragments.");
    await writeDefaultFragments();
    await addExtraFragments(reporter);
}
