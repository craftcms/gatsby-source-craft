"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var fs = require("fs-extra");
var fetch = require("node-fetch");
var path = require("path");
var print = require("gatsby/graphql").print;
var _a = require("gatsby-graphql-source-toolkit"), sourceAllNodes = _a.sourceAllNodes, sourceNodeChanges = _a.sourceNodeChanges, createSchemaCustomization = _a.createSchemaCustomization, generateDefaultFragments = _a.generateDefaultFragments, compileNodeQueries = _a.compileNodeQueries, buildNodeDefinitions = _a.buildNodeDefinitions, wrapQueryExecutorWithQueue = _a.wrapQueryExecutorWithQueue, loadSchema = _a.loadSchema;
var _b = require("graphql"), isInterfaceType = _b.isInterfaceType, isListType = _b.isListType;
var craftGqlToken = process.env.CRAFTGQL_TOKEN;
var craftGqlUrl = process.env.CRAFTGQL_URL;
var loadedPluginOptions = {
    concurrency: 10,
    debugDir: __dirname + "/.cache/craft-graphql-documents",
    fragmentsDir: __dirname + "/src/craft-fragments",
    typePrefix: "Craft_"
};
var schema;
var gatsbyNodeTypes;
var sourcingConfig;
function getSchema() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!schema) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadSchema(execute)];
                case 1:
                    schema = _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, schema];
            }
        });
    });
}
function getGatsbyNodeTypes() {
    var _a;
    return __awaiter(this, void 0, void 0, function () {
        var schema, queries, queryResponse, sourceNodeInformation, queryMap, _i, sourceNodeInformation_1, nodeInformation, extractNodesFromInterface, fragmentHelper, _loop_1, _b, _c, _d, interfaceName, sourceNodeInformation_2;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (gatsbyNodeTypes) {
                        return [2 /*return*/, gatsbyNodeTypes];
                    }
                    return [4 /*yield*/, getSchema()];
                case 1:
                    schema = _e.sent();
                    queries = (_a = schema.getQueryType()) === null || _a === void 0 ? void 0 : _a.getFields();
                    if (!queries) {
                        return [2 /*return*/, ([])];
                    }
                    // Check if Craft endpoint has Gatsby plugin installed
                    if (!queries.sourceNodeInformation) {
                        return [2 /*return*/, ([])];
                    }
                    return [4 /*yield*/, execute({
                            operationName: 'sourceNodeData',
                            query: 'query sourceNodeData { sourceNodeInformation { node list filterArgument filterTypeExpression  targetInterface } }',
                            variables: {}
                        })];
                case 2:
                    queryResponse = _e.sent();
                    if (!(queryResponse.data && queryResponse.data.sourceNodeInformation)) {
                        return [2 /*return*/, ([])];
                    }
                    sourceNodeInformation = queryResponse.data.sourceNodeInformation;
                    queryMap = {};
                    // Loop through returned data and build the query map Craft has provided for us.
                    for (_i = 0, sourceNodeInformation_1 = sourceNodeInformation; _i < sourceNodeInformation_1.length; _i++) {
                        nodeInformation = sourceNodeInformation_1[_i];
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
                    }
                    extractNodesFromInterface = function (ifaceName, doc) {
                        var iface = schema.getType(ifaceName);
                        return !iface ? [] : schema.getPossibleTypes(iface).map(function (type) { return ({
                            remoteTypeName: type.name,
                            queries: doc(type.name)
                        }); });
                    };
                    fragmentHelper = function (typeName) {
                        var fragmentName = '_Craft' + typeName + 'ID_';
                        return {
                            fragmentName: fragmentName,
                            fragment: "\n            fragment " + fragmentName + " on " + typeName + " {\n                __typename\n                id\n            }\n            "
                        };
                    };
                    gatsbyNodeTypes = [];
                    _loop_1 = function (interfaceName, sourceNodeInformation_2) {
                        // extract all the different types for the interfaces
                        gatsbyNodeTypes.push.apply(gatsbyNodeTypes, extractNodesFromInterface(interfaceName, function (typeName) {
                            var queries = '';
                            var fragmentInfo = fragmentHelper(typeName);
                            queries = fragmentInfo.fragment;
                            // and define queries for the concrete type
                            if (sourceNodeInformation_2.node) {
                                queries += "query NODE_" + typeName + " { " + sourceNodeInformation_2.node + "(id: $id) { ... " + fragmentInfo.fragmentName + "  } }\n                ";
                            }
                            if (sourceNodeInformation_2.filterArgument) {
                                var regexp = new RegExp(sourceNodeInformation_2.filterTypeExpression);
                                var matches = typeName.match(regexp);
                                if (matches && matches[1]) {
                                    var typeFilter = sourceNodeInformation_2.filterArgument + ': "' + matches[1] + '"';
                                    queries += "query LIST_" + typeName + " { " + sourceNodeInformation_2.list + "(" + typeFilter + " limit: $limit, offset: $offset) { ... " + fragmentInfo.fragmentName + " } }\n                    ";
                                }
                            }
                            return queries;
                        }));
                    };
                    // For all the mapped queries
                    for (_b = 0, _c = Object.entries(queryMap); _b < _c.length; _b++) {
                        _d = _c[_b], interfaceName = _d[0], sourceNodeInformation_2 = _d[1];
                        _loop_1(interfaceName, sourceNodeInformation_2);
                    }
                    return [2 /*return*/, (gatsbyNodeTypes)];
            }
        });
    });
}
function writeDefaultFragments() {
    return __awaiter(this, void 0, void 0, function () {
        var defaultFragments, _a, _b, _i, defaultFragments_1, _c, remoteTypeName, fragment, filePath;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = generateDefaultFragments;
                    _b = {};
                    return [4 /*yield*/, getSchema()];
                case 1:
                    _b.schema = _d.sent();
                    return [4 /*yield*/, getGatsbyNodeTypes()];
                case 2:
                    defaultFragments = _a.apply(void 0, [(_b.gatsbyNodeTypes = _d.sent(),
                            _b)]);
                    _i = 0, defaultFragments_1 = defaultFragments;
                    _d.label = 3;
                case 3:
                    if (!(_i < defaultFragments_1.length)) return [3 /*break*/, 6];
                    _c = defaultFragments_1[_i], remoteTypeName = _c[0], fragment = _c[1];
                    filePath = path.join(loadedPluginOptions.fragmentsDir, remoteTypeName + ".graphql");
                    if (!!fs.existsSync(filePath)) return [3 /*break*/, 5];
                    return [4 /*yield*/, fs.writeFile(filePath, fragment)];
                case 4:
                    _d.sent();
                    _d.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function collectFragments() {
    return __awaiter(this, void 0, void 0, function () {
        var customFragments, _i, _a, fileName, filePath, fragment;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    customFragments = [];
                    _i = 0;
                    return [4 /*yield*/, fs.readdir(loadedPluginOptions.fragmentsDir)];
                case 1:
                    _a = _b.sent();
                    _b.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 5];
                    fileName = _a[_i];
                    if (!/.graphql$/.test(fileName)) return [3 /*break*/, 4];
                    filePath = path.join(loadedPluginOptions.fragmentsDir, fileName);
                    return [4 /*yield*/, fs.readFile(filePath)];
                case 3:
                    fragment = _b.sent();
                    customFragments.push(fragment.toString());
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, customFragments];
            }
        });
    });
}
function writeCompiledQueries(nodeDocs) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, nodeDocs_1, _a, remoteTypeName, document_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _i = 0, nodeDocs_1 = nodeDocs;
                    _b.label = 1;
                case 1:
                    if (!(_i < nodeDocs_1.length)) return [3 /*break*/, 4];
                    _a = nodeDocs_1[_i], remoteTypeName = _a[0], document_1 = _a[1];
                    return [4 /*yield*/, fs.writeFile(loadedPluginOptions.debugDir + ("/" + remoteTypeName + ".graphql"), print(document_1))];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function execute(operation) {
    return __awaiter(this, void 0, void 0, function () {
        var operationName, query, _a, variables, res;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    operationName = operation.operationName, query = operation.query, _a = operation.variables, variables = _a === void 0 ? {} : _a;
                    return [4 /*yield*/, fetch(craftGqlUrl, {
                            method: "POST",
                            body: JSON.stringify({ query: query, variables: variables, operationName: operationName }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: "Bearer " + craftGqlToken
                            }
                        })];
                case 1:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 2: return [2 /*return*/, _b.sent()];
            }
        });
    });
}
exports.onPreBootstrap = function (gatsbyApi, pluginOptions) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                loadedPluginOptions.concurrency = (_a = pluginOptions.concurrency) !== null && _a !== void 0 ? _a : loadedPluginOptions.concurrency;
                loadedPluginOptions.debugDir = (_b = pluginOptions.debugDir) !== null && _b !== void 0 ? _b : loadedPluginOptions.debugDir;
                loadedPluginOptions.fragmentsDir = (_c = pluginOptions.fragmentsDir) !== null && _c !== void 0 ? _c : loadedPluginOptions.fragmentsDir;
                loadedPluginOptions.typePrefix = (_d = pluginOptions.typePrefix) !== null && _d !== void 0 ? _d : loadedPluginOptions.typePrefix;
                return [4 /*yield*/, fs.ensureDir(loadedPluginOptions.debugDir)];
            case 1:
                _e.sent();
                return [4 /*yield*/, fs.ensureDir(loadedPluginOptions.fragmentsDir)];
            case 2:
                _e.sent();
                return [4 /*yield*/, ensureFragmentsExist(gatsbyApi.reporter)];
            case 3:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.createSchemaCustomization = function (gatsbyApi, pluginOptions) { return __awaiter(void 0, void 0, void 0, function () {
    var config;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getSourcingConfig(gatsbyApi)];
            case 1:
                config = _a.sent();
                return [4 /*yield*/, createSchemaCustomization(config)];
            case 2:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.sourceNodes = function (gatsbyApi) { return __awaiter(void 0, void 0, void 0, function () {
    var cache, reporter, config, data, remoteConfigVersion, remoteContentUpdateTime, localConfigVersion, localContentUpdateTime, data_1, updatedNodes, deletedNodes, nodeEvents;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                cache = gatsbyApi.cache, reporter = gatsbyApi.reporter;
                return [4 /*yield*/, getSourcingConfig(gatsbyApi)];
            case 1:
                config = _a.sent();
                reporter.info("Checking Craft config version.");
                return [4 /*yield*/, execute({
                        operationName: 'craftState',
                        query: 'query craftState { configVersion  lastUpdateTime}',
                        variables: {}
                    })];
            case 2:
                data = (_a.sent()).data;
                remoteConfigVersion = data.configVersion;
                remoteContentUpdateTime = data.lastUpdateTime;
                return [4 /*yield*/, cache.get("CRAFT_CONFIG_VERSION")];
            case 3:
                localConfigVersion = (_a.sent()) || '';
                return [4 /*yield*/, cache.get("CRAFT_LAST_CONTENT_UPDATE")];
            case 4:
                localContentUpdateTime = (_a.sent()) || '';
                if (!(remoteConfigVersion !== localConfigVersion || !localContentUpdateTime)) return [3 /*break*/, 6];
                reporter.info("Cached content is unavailable or outdated, sourcing _all_ nodes.");
                return [4 /*yield*/, sourceAllNodes(config)];
            case 5:
                _a.sent();
                return [3 /*break*/, 9];
            case 6:
                reporter.info("Craft config version has not changed since last sourcing. Checking for content changes since \"" + localContentUpdateTime + "\".");
                return [4 /*yield*/, execute({
                        operationName: 'nodeChanges',
                        query: "query nodeChanges {  \n                nodesUpdatedSince (since: \"" + localContentUpdateTime + "\") { nodeId nodeType }\n                nodesDeletedSince (since: \"" + localContentUpdateTime + "\") { nodeId nodeType }\n            }",
                        variables: {}
                    })];
            case 7:
                data_1 = (_a.sent()).data;
                updatedNodes = data_1.nodesUpdatedSince;
                deletedNodes = data_1.nodesDeletedSince;
                nodeEvents = __spreadArrays(updatedNodes.map(function (entry) {
                    return {
                        eventName: 'UPDATE',
                        remoteTypeName: entry.nodeType,
                        remoteId: { __typename: entry.nodeType, id: entry.nodeId }
                    };
                }), deletedNodes.map(function (entry) {
                    return {
                        eventName: 'DELETE',
                        remoteTypeName: entry.nodeType,
                        remoteId: { __typename: entry.nodeType, id: entry.nodeId }
                    };
                }));
                if (nodeEvents.length) {
                    reporter.info("Sourcing changes for " + nodeEvents.length + " nodes.");
                }
                else {
                    reporter.info("No content changes found.");
                }
                return [4 /*yield*/, sourceNodeChanges(config, { nodeEvents: nodeEvents })];
            case 8:
                _a.sent();
                _a.label = 9;
            case 9: return [4 /*yield*/, cache.set("CRAFT_CONFIG_VERSION", remoteConfigVersion)];
            case 10:
                _a.sent();
                return [4 /*yield*/, cache.set("CRAFT_LAST_CONTENT_UPDATE", remoteContentUpdateTime)];
            case 11:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
function getSourcingConfig(gatsbyApi) {
    return __awaiter(this, void 0, void 0, function () {
        var schema, gatsbyNodeTypes, documents, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (sourcingConfig) {
                        return [2 /*return*/, sourcingConfig];
                    }
                    return [4 /*yield*/, getSchema()];
                case 1:
                    schema = _c.sent();
                    return [4 /*yield*/, getGatsbyNodeTypes()];
                case 2:
                    gatsbyNodeTypes = _c.sent();
                    _a = compileNodeQueries;
                    _b = {
                        schema: schema,
                        gatsbyNodeTypes: gatsbyNodeTypes
                    };
                    return [4 /*yield*/, collectFragments()];
                case 3: return [4 /*yield*/, _a.apply(void 0, [(_b.customFragments = _c.sent(),
                            _b)])];
                case 4:
                    documents = _c.sent();
                    return [4 /*yield*/, writeCompiledQueries(documents)];
                case 5:
                    _c.sent();
                    return [2 /*return*/, (sourcingConfig = {
                            gatsbyApi: gatsbyApi,
                            schema: schema,
                            gatsbyNodeDefs: buildNodeDefinitions({ gatsbyNodeTypes: gatsbyNodeTypes, documents: documents }),
                            gatsbyTypePrefix: loadedPluginOptions.typePrefix,
                            execute: wrapQueryExecutorWithQueue(execute, { concurrency: loadedPluginOptions.concurrency }),
                            verbose: true
                        })];
            }
        });
    });
}
function ensureFragmentsExist(reporter) {
    return __awaiter(this, void 0, void 0, function () {
        var fragmentDir, fragments;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    fragmentDir = loadedPluginOptions.fragmentsDir;
                    return [4 /*yield*/, fs.readdir(fragmentDir)];
                case 1:
                    fragments = _a.sent();
                    if (!(fragments.length == 0)) return [3 /*break*/, 3];
                    reporter.info("No fragments found, writing default fragments.");
                    return [4 /*yield*/, writeDefaultFragments()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    reporter.info(fragments.length + " fragments found, skipping writing default fragments");
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
