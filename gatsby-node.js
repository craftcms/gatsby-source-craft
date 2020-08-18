"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */
const fs = require("fs-extra");
const fetch = require("node-fetch");
const path = require("path");
const { print } = require("gatsby/graphql");
const { sourceAllNodes, sourceNodeChanges, createSchemaCustomization, generateDefaultFragments, compileNodeQueries, buildNodeDefinitions, wrapQueryExecutorWithQueue, loadSchema, } = require("gatsby-graphql-source-toolkit");
const { isInterfaceType, isListType } = require("graphql");
const fragmentsDir = __dirname + "/src/craft-fragments";
const debugDir = __dirname + "/.cache/craft-graphql-documents";
const gatsbyTypePrefix = `Craft_`;
const craftGqlToken = process.env.CRAFTGQL_TOKEN;
const craftGqlUrl = process.env.CRAFTGQL_URL;
let schema;
let gatsbyNodeTypes;
let sourcingConfig;
async function getSchema() {
    if (!schema) {
        schema = await loadSchema(execute);
    }
    return schema;
}
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
    const queryMap = {};
    // Check all the queries
    for (let typeDef of Object.values(queries)) {
        let queryName = typeDef.name;
        let returnType = typeDef.type;
        let plural = false;
        // If wrapped in a list, unwrap and mark as plural
        if (isListType(typeDef.type)) {
            returnType = typeDef.type.ofType;
            plural = true;
        }
        // If this is an interface
        if (isInterfaceType(returnType)) {
            let obj = plural ? { list: queryName } : { node: queryName };
            if (!queryMap[returnType.name]) {
                queryMap[returnType.name] = {};
            }
            // Add the relevant query to the interface in the map
            queryMap[returnType.name] = Object.assign(queryMap[returnType.name], obj);
        }
    }
    const extractNodesFromInterface = (ifaceName, doc) => {
        const iface = schema.getType(ifaceName);
        return !iface ? [] : schema.getPossibleTypes(iface).map(type => ({
            remoteTypeName: type.name,
            queries: doc(type.name),
        }));
    };
    // prettier-ignore
    // Fragment definition helper
    const fragmentHelper = (typeName) => {
        const fragmentName = '_Craft' + typeName + 'ID_';
        return {
            fragmentName: fragmentName,
            fragment: `
            fragment ${fragmentName} on ${typeName} {
                __typename
                id
            }
            `
        };
    };
    gatsbyNodeTypes = [];
    // For all the mapped queries
    for (const [key, value] of Object.entries(queryMap)) {
        // extract all the different types for the interfaces
        gatsbyNodeTypes.push(...extractNodesFromInterface(key, typeName => {
            let queries = '';
            let fragmentInfo = fragmentHelper(typeName);
            queries = fragmentInfo.fragment;
            // and define queries for the concrete type
            if (value.node) {
                queries += `query NODE_${typeName} { ${value.node}(id: $id) { ... ${fragmentInfo.fragmentName}  } }
            `;
            }
            if (value.list) {
                queries += `query LIST_${typeName} { ${value.list}(type: "${typeName.split('_')[0]}", limit: $limit, offset: $offset) { ... ${fragmentInfo.fragmentName} } }
            `;
            }
            return queries;
        }));
    }
    return (gatsbyNodeTypes);
}
async function writeDefaultFragments() {
    const defaultFragments = generateDefaultFragments({
        schema: await getSchema(),
        gatsbyNodeTypes: await getGatsbyNodeTypes(),
    });
    for (const [remoteTypeName, fragment] of defaultFragments) {
        const filePath = path.join(fragmentsDir, `${remoteTypeName}.graphql`);
        if (!fs.existsSync(filePath)) {
            await fs.writeFile(filePath, fragment);
        }
    }
}
async function collectFragments() {
    const customFragments = [];
    for (const fileName of await fs.readdir(fragmentsDir)) {
        if (/.graphql$/.test(fileName)) {
            const filePath = path.join(fragmentsDir, fileName);
            const fragment = await fs.readFile(filePath);
            customFragments.push(fragment.toString());
        }
    }
    return customFragments;
}
async function writeCompiledQueries(nodeDocs) {
    await fs.ensureDir(debugDir);
    // @ts-ignore
    for (const [remoteTypeName, document] of nodeDocs) {
        await fs.writeFile(debugDir + `/${remoteTypeName}.graphql`, print(document));
    }
}
async function getSourcingConfig(gatsbyApi, pluginOptions) {
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
        gatsbyTypePrefix,
        execute: wrapQueryExecutorWithQueue(execute, { concurrency: 10 }),
        verbose: true,
    });
}
async function execute(operation) {
    let { operationName, query, variables = {} } = operation;
    // console.log(operationName, variables)
    const res = await fetch(craftGqlUrl, {
        method: "POST",
        body: JSON.stringify({ query, variables, operationName }),
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${craftGqlToken}`,
        },
    });
    return await res.json();
}
exports.onPreBootstrap = async (gatsbyApi, pluginOptions) => {
    await writeDefaultFragments();
};
exports.createSchemaCustomization = async (gatsbyApi, pluginOptions) => {
    const config = await getSourcingConfig(gatsbyApi, pluginOptions);
    await createSchemaCustomization(config);
};
exports.sourceNodes = async (gatsbyApi, pluginOptions) => {
    const { cache } = gatsbyApi;
    const config = await getSourcingConfig(gatsbyApi, pluginOptions);
    const cached = (await cache.get(`CRAFT_SOURCED`)) || false;
    if (cached) {
        // TODO node events for deltas
        // // Applying changes since the last sourcing
        // const nodeEvents = [
        //     {
        //         eventName: "DELETE",
        //         remoteTypeName: "blog_blog_Entry",
        //         remoteId: {__typename: "blog_blog_Entry", id: "422"},
        //     },
        //     {
        //         eventName: "UPDATE",
        //         remoteTypeName: "blog_blog_Entry",
        //         remoteId: {__typename: "blog_blog_Entry", id: "421"},
        //     },
        //     {
        //         eventName: "UPDATE",
        //         remoteTypeName: "blog_blog_Entry",
        //         remoteId: {__typename: "blog_blog_Entry", id: "18267"},
        //     },
        //     {
        //         eventName: "UPDATE",
        //         remoteTypeName: "blog_blog_Entry",
        //         remoteId: {__typename: "blog_blog_Entry", id: "11807"},
        //     },
        // ]
        //console.log(`Sourcing delta!`)
        //await sourceNodeChanges(config, {nodeEvents})
        return;
    }
    await sourceAllNodes(config);
    await cache.set(`CRAFT_SOURCED`, true);
};
