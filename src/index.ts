import Axios, { Method } from 'axios';
import { rmdirSync } from 'fs';
import { ensureDirSync, writeFileSync } from 'fs-extra';
import * as multimatch from 'multimatch';
import { parse, resolve } from 'path';
import { ISummary } from 'schema.io';
import ts = require('typescript');
import * as url from 'url';

export interface IOptions {
  url: string;
  destination: string;
  docSecret?: string;
  target?: 'axios' | 'msio';
  pattern?: string | string[];
}

export interface IKoactMeta {
  title?: string;
  description?: string;

  [key: string]: any;
}

export interface IKoactSubDoc {
  meta: IKoactMeta;
  path: string;
}

export interface IKoactAPI {
  method: Method;
  path: string;
  version: Record<string, {
    name: string;
    params?: ISummary;
    query?: ISummary;
    body?: ISummary;
    res?: ISummary;
  }>;
}

export interface IKoactDoc {
  meta: IKoactMeta;
  subDocs: IKoactSubDoc[];
  apis: IKoactAPI[];
}

function headToUpperCase(str: string) {
  if (!str) {
    return str;
  }
  return `${str[0].toUpperCase()}${str.slice(1)}`;
}

async function fetchDoc(baseUrl: string, path: string, docSecret?: string) {
  const { data } = await Axios.get<IKoactDoc>(`${baseUrl}${path}`, {
    params: { docSecret },
  });
  return data;
}

export function schemaSummaryToTypeNode(schemaSummary: ISummary | undefined, typeNodes: ts.Node[], interfaceName: string): ts.TypeNode {
  if (!schemaSummary) {
    return ts.createTypeReferenceNode('any', undefined);
  }
  if (schemaSummary.enums && schemaSummary.enums.length > 0) {
    return ts.createUnionTypeNode(schemaSummary.enums.map(e => {
      if (typeof e === 'string') {
        return ts.createTypeReferenceNode(`"${e}"`, undefined);
      }
      return ts.createLiteralTypeNode(ts.createLiteral(e));
    }));
  }
  switch (schemaSummary.type) {
    case 'null':
      return ts.createTypeReferenceNode('null', undefined);
    case 'String':
      return ts.createTypeReferenceNode('string', undefined);
    case 'Number':
      return ts.createTypeReferenceNode('number', undefined);
    case 'Boolean':
      return ts.createTypeReferenceNode('boolean', undefined);
    case 'Date':
      return ts.createTypeReferenceNode('Date', undefined);
    case 'Array':
      return ts.createArrayTypeNode(schemaSummaryToTypeNode(schemaSummary.element, typeNodes, `${interfaceName}Item`));
    case 'Object': {
      // create interface
      const finalInterfaceName = `I${headToUpperCase(interfaceName)}`;
      const interfaceNode = ts.createInterfaceDeclaration(
        undefined,
        ts.createModifiersFromModifierFlags(ts.ModifierFlags.Export),
        finalInterfaceName,
        undefined,
        undefined,
        Object.keys(schemaSummary.object!).map(key => {
          const ss = schemaSummary.object![key];
          const signature = ts.createPropertySignature(
            undefined,
            key,
            !ss.required ? ts.createToken(ts.SyntaxKind.QuestionToken) : undefined,
            schemaSummaryToTypeNode(ss, typeNodes, `${interfaceName}${headToUpperCase(key)}`),
            undefined,
          );
          if (!ss.explain) {
            return signature;
          }
          return ts.addSyntheticLeadingComment(
            signature,
            ts.SyntaxKind.MultiLineCommentTrivia,
            ` ${ss.explain} `,
            true,
          );
        }),
      );
      if (schemaSummary.explain) {
        typeNodes.push(ts.addSyntheticLeadingComment(
          interfaceNode,
          ts.SyntaxKind.MultiLineCommentTrivia,
          ` ${schemaSummary.explain} `,
          true,
        ));
      } else {
        typeNodes.push(interfaceNode);
      }
      return ts.createTypeReferenceNode(finalInterfaceName, undefined);
    }
    case 'Alter':
      return ts.createUnionTypeNode(schemaSummary.alter!.map((ss, index) => schemaSummaryToTypeNode(ss, typeNodes, `${interfaceName}Alter${index}`)));
    default:
  }
  return ts.createTypeReferenceNode('any', undefined);
}

export function printNodes(nodes: ts.Node[], noConsole = true) {
  const resultFile = ts.createSourceFile('', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
  });
  const result = printer.printList(
    ts.ListFormat.MultiLine,
    ts.createNodeArray(nodes, true),
    resultFile,
  );
  if (!noConsole) {
    console.log(result);
  }
  return result;
}

export default async function koactDocToDefinition(options: IOptions) {
  const target = options.target || 'axios';
  if (!['axios', 'msio'].includes(target)) {
    throw new Error('Target should be `axios` or `msio`, default is `axios`.');
  }
  console.log('Generate api files for target:', target);
  console.log(`Use typescript v:${ts.version}`);

  console.log('Clear destination.');
  rmdirSync(options.destination, { recursive: true });
  console.log(`Ensure destination: ${options.destination}`);
  ensureDirSync(options.destination);

  const basePath = url.parse(options.url).pathname;
  console.log('Base path is:', basePath);

  function emitToFile(code: string, moduleName: string) {
    writeFileSync(resolve(options.destination, `${moduleName}.ts`), code);
    console.log(`Emit module: ${moduleName}`);
  }

  if (target === 'axios') {
    async function createModule(baseUrl: string, path: string) {
      const moduleName = `API${parse(path).dir.slice(1).split('/').map(e => {
        if (!e) {
          return 'Root';
        }
        if (e[0] === ':') {
          return '';
        }
        return headToUpperCase(e);
      }).join('')}`;
      console.log('Start generating module:', moduleName);
      const doc = await fetchDoc(baseUrl, path, options.docSecret);

      const importNodes: ts.Node[] = [
        ts.addSyntheticLeadingComment(ts.createIdentifier(''), ts.SyntaxKind.MultiLineCommentTrivia, ' tslint:disable ', true),
      ];
      const typeNodes: ts.Node[] = [];
      const subModuleNames: string[] = [];
      // import { AxiosInstance } from "axios";
      importNodes.push(ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(
          undefined,
          ts.createNamedImports(
            [ts.createImportSpecifier(undefined, ts.createIdentifier('AxiosInstance'))],
          ),
        ),
        ts.createStringLiteral('axios'),
      ));
      // import APISubRoutes from "./APISubRoutes";
      await Promise.all(doc.subDocs.map(async subDoc => {
        // filter some useless sub modules.
        if (options.pattern && !multimatch(subDoc.path, options.pattern).includes(subDoc.path)) {
          return;
        }
        const subModuleName = await createModule(baseUrl, subDoc.path);
        importNodes.push(ts.createImportDeclaration(
          undefined,
          undefined,
          ts.createImportClause(
            ts.createIdentifier(subModuleName),
            undefined,
          ),
          ts.createStringLiteral(`./${subModuleName}`),
        ));
        subModuleNames.push(subModuleName);
      }));
      // /**
      //  * title: Koact api document
      //  * description: This is description.
      //  */
      // export default class RootAPI {
      //   public apiSubRoutes: APISubRoutes;
      //   private _axiosInstance: AxiosInstance;
      //   constructor(axiosInstance: AxiosInstance) {
      //     this._axiosInstance = axiosInstance;
      //     this.apiSubRoutes = new APISubRoutes(axiosInstance);
      //   }
      //   // GET root
      //   public async root(q_foo: string): Promise<string> {
      //     const { data } = await this._axiosInstance.get<string>("/", {
      //       params: { foo: q_foo }
      //     });
      //     return data;
      //   }
      // }
      const axiosInstanceTypeNode = ts.createTypeReferenceNode('AxiosInstance', undefined);
      const classNode = ts.addSyntheticLeadingComment(
        ts.createClassExpression(
          ts.createModifiersFromModifierFlags(
            ts.ModifierFlags.Export | ts.ModifierFlags.Default,
          ),
          ts.createIdentifier(moduleName),
          undefined,
          undefined,
          [
            ...(subModuleNames.map(subModuleName => {
              return ts.createProperty(
                undefined,
                ts.createModifiersFromModifierFlags(
                  ts.ModifierFlags.Public,
                ),
                subModuleName.replace(/^API/, 'api'),
                undefined,
                ts.createTypeReferenceNode(subModuleName, undefined),
                undefined,
              );
            })),
            ts.createProperty(
              undefined,
              ts.createModifiersFromModifierFlags(
                ts.ModifierFlags.Private,
              ),
              '_axiosInstance',
              undefined,
              axiosInstanceTypeNode,
              undefined,
            ),
            ts.createConstructor(
              undefined,
              undefined,
              [ts.createParameter(
                undefined,
                undefined,
                undefined,
                'axiosInstance',
                undefined,
                axiosInstanceTypeNode,
                undefined,
              )],
              ts.createBlock([
                ts.createExpressionStatement(ts.createAssignment(
                  ts.createPropertyAccess(
                    ts.createThis(),
                    '_axiosInstance',
                  ),
                  ts.createIdentifier('axiosInstance'),
                )),
                ...subModuleNames.map(subModuleName => ts.createExpressionStatement(ts.createAssignment(
                  ts.createPropertyAccess(
                    ts.createThis(),
                    subModuleName.replace(/^API/, 'api'),
                  ),
                  ts.createNew(ts.createIdentifier(subModuleName), undefined, [
                    ts.createIdentifier('axiosInstance'),
                  ]),
                ))),
              ], true),
            ),
            ...(doc.apis.reduce<ts.ClassElement[]>((memo, api) => {
              Object.keys(api.version).forEach(version => {
                const apiData = api.version[version];
                const apiPath = api.path.replace(new RegExp(`^${basePath}`), '');
                const apiName = api.method.toLowerCase() + apiPath.slice(1).split('/').map(e => {
                  if (!e) {
                    return 'Root';
                  }
                  if (e[0] === ':') {
                    return '';
                  }
                  return headToUpperCase(e);
                }).join('').replace(/\./g, 'Dot') + (version === 'default' ? '' : headToUpperCase(version));
                const paramsTypeNode = schemaSummaryToTypeNode(apiData.params, typeNodes, `${apiName}Params`);
                const queryTypeNode = schemaSummaryToTypeNode(apiData.query, typeNodes, `${apiName}Query`);
                const bodyTypeNode = schemaSummaryToTypeNode(apiData.body, typeNodes, `${apiName}Body`);
                const responseTypeNode = schemaSummaryToTypeNode(apiData.res, typeNodes, `${apiName}Response`);
                const responseTypeNodeCheckOptional = apiData.res?.required ? responseTypeNode : ts.createUnionTypeNode([responseTypeNode, ts.createTypeReferenceNode('undefined', undefined)]);
                const parameters: ts.ParameterDeclaration[] = [];
                const questionToken = ts.createToken(ts.SyntaxKind.QuestionToken);
                let apiPathExpression: ts.Expression = ts.createStringLiteral(apiPath);
                if (apiData.params) {
                  if (apiData.params.type === 'Object') {
                    Object.keys(apiData.params.object!).forEach(key => {
                      const apiPathExpressionReplaceFunction = ts.createPropertyAccess(apiPathExpression, 'replace');
                      apiPathExpression = ts.createCall(
                        apiPathExpressionReplaceFunction,
                        undefined,
                        [
                          ts.createRegularExpressionLiteral(`/:${key}/g`),
                          ts.createPropertyAccess(ts.createIdentifier('params'), key),
                        ],
                      );
                    });
                  }
                  parameters.push(ts.createParameter(
                    undefined,
                    undefined,
                    undefined,
                    'params',
                    apiData.params.required ? undefined : questionToken,
                    paramsTypeNode,
                    undefined,
                  ));
                }
                if (apiData.query) {
                  parameters.push(ts.createParameter(
                    undefined,
                    undefined,
                    undefined,
                    'query',
                    apiData.query.required ? undefined : questionToken,
                    queryTypeNode,
                    undefined,
                  ));
                }
                if (apiData.body) {
                  parameters.push(ts.createParameter(
                    undefined,
                    undefined,
                    undefined,
                    'body',
                    apiData.body.required ? undefined : questionToken,
                    bodyTypeNode,
                    undefined,
                  ));
                }
                const method = api.method.toLowerCase();
                const useRequestBody = ['post', 'put'].includes(method);
                const requestCallArguments: ts.Expression[] = [apiPathExpression];
                if (useRequestBody) {
                  if (apiData.body) {
                    requestCallArguments.push(ts.createIdentifier('body'));
                  } else if (apiData.query) {
                    requestCallArguments.push(ts.createIdentifier('undefined'));
                  }
                }
                if (apiData.query || version !== 'default') {
                  const configObjectProperties: ts.ObjectLiteralElementLike[] = [];
                  if (apiData.query) {
                    configObjectProperties.push(ts.createPropertyAssignment(
                      'params',
                      ts.createIdentifier('query'),
                    ));
                  }
                  if (version !== 'default') {
                    configObjectProperties.push(ts.createPropertyAssignment(
                      'headers',
                      ts.createObjectLiteral([ts.createPropertyAssignment(
                        'version',
                        ts.createIdentifier(`"${version}"`),
                      )]),
                    ));
                  }
                  requestCallArguments.push(ts.createObjectLiteral(configObjectProperties));
                }
                memo.push(ts.addSyntheticLeadingComment(
                  ts.createMethod(
                    undefined,
                    ts.createModifiersFromModifierFlags(
                      ts.ModifierFlags.Public | ts.ModifierFlags.Async,
                    ),
                    undefined,
                    apiName,
                    undefined,
                    undefined,
                    parameters,
                    ts.createTypeReferenceNode('Promise', [responseTypeNodeCheckOptional]),
                    ts.createBlock([
                      ts.createVariableStatement(
                        undefined,
                        ts.createVariableDeclarationList([
                          ts.createVariableDeclaration(
                            ts.createObjectBindingPattern([
                              ts.createBindingElement(undefined, undefined, 'data', undefined),
                            ]),
                            undefined,
                            ts.createAwait(ts.createCall(
                              ts.createPropertyAccess(ts.createThis(), `_axiosInstance.${method}`),
                              [responseTypeNodeCheckOptional],
                              requestCallArguments,
                            )),
                          ),
                        ], ts.NodeFlags.Const),
                      ),
                      ts.createReturn(ts.createIdentifier('data')),
                    ], true),
                  ),
                  ts.SyntaxKind.SingleLineCommentTrivia,
                  ` [version:${version}] ${apiData.name} ${api.method.toUpperCase()} ${apiPath}`,
                  true,
                ));
              });
              return memo;
            }, [])),
          ],
        ),
        ts.SyntaxKind.MultiLineCommentTrivia,
        `\ntitle: ${doc.meta.title || 'UNKNOWN'}\ndescription: ${doc.meta.description || 'No description.'}\n`,
        true,
      );

      const code = printNodes([
        ...importNodes,
        ...typeNodes,
        classNode,
      ], true);

      emitToFile(code, moduleName);
      return moduleName;
    }

    await createModule(options.url, '/api.doc');
  } else if (target === 'msio') {
    async function createModule(baseUrl: string, path: string) {
      const moduleName = `IO${parse(path).dir.slice(1).split('/').map(e => {
        if (!e) {
          return 'Root';
        }
        if (e[0] === ':') {
          return '';
        }
        return headToUpperCase(e);
      }).join('')}`;
      console.log('Start generating module:', moduleName);
      const doc = await fetchDoc(baseUrl, path, options.docSecret);

      // import { ObjectId } from 'bson';
      // import { ClientSession } from 'mongoose';
      // import MSIO, { IBody, IMSQueueOptionalOptions, IParams } from 'msio';
      const importNodes: ts.Node[] = [
        ts.addSyntheticLeadingComment(ts.createIdentifier(''), ts.SyntaxKind.MultiLineCommentTrivia, ' tslint:disable ', true),
        ts.createImportDeclaration(
          undefined,
          undefined,
          ts.createImportClause(
            undefined,
            ts.createNamedImports(
              [ts.createImportSpecifier(undefined, ts.createIdentifier('ObjectId'))],
            ),
          ),
          ts.createStringLiteral('bson'),
        ),
        ts.createImportDeclaration(
          undefined,
          undefined,
          ts.createImportClause(
            undefined,
            ts.createNamedImports(
              [ts.createImportSpecifier(undefined, ts.createIdentifier('ClientSession'))],
            ),
          ),
          ts.createStringLiteral('mongoose'),
        ),
        ts.createImportDeclaration(
          undefined,
          undefined,
          ts.createImportClause(
            ts.createIdentifier('MSIO'),
            ts.createNamedImports([
              ts.createImportSpecifier(undefined, ts.createIdentifier('IBody')),
              ts.createImportSpecifier(undefined, ts.createIdentifier('IMSQueueOptionalOptions')),
              ts.createImportSpecifier(undefined, ts.createIdentifier('IParams')),
            ]),
          ),
          ts.createStringLiteral('msio'),
        ),
      ];
      const typeNodes: ts.Node[] = [];
      const subModuleNames: string[] = [];
      // import subModule
      await Promise.all(doc.subDocs.map(async subDoc => {
        // filter some useless sub modules.
        if (options.pattern && !multimatch(subDoc.path, options.pattern).includes(subDoc.path)) {
          return;
        }
        const subModuleName = await createModule(baseUrl, subDoc.path);
        importNodes.push(ts.createImportDeclaration(
          undefined,
          undefined,
          ts.createImportClause(
            ts.createIdentifier(subModuleName),
            undefined,
          ),
          ts.createStringLiteral(`./${subModuleName}`),
        ));
        subModuleNames.push(subModuleName);
      }));
      const msioInstanceTypeNode = ts.createTypeReferenceNode('MSIO', undefined);
      const clientSessionTypeNode = ts.createTypeReferenceNode('ClientSession', undefined);
      const questionToken = ts.createToken(ts.SyntaxKind.QuestionToken);
      const classNode = ts.addSyntheticLeadingComment(
        ts.createClassExpression(
          ts.createModifiersFromModifierFlags(
            ts.ModifierFlags.Export | ts.ModifierFlags.Default,
          ),
          ts.createIdentifier(moduleName),
          undefined,
          undefined,
          [
            ...(subModuleNames.map(subModuleName => {
              return ts.createProperty(
                undefined,
                ts.createModifiersFromModifierFlags(ts.ModifierFlags.Public),
                subModuleName.replace(/^IO/, 'io'),
                undefined,
                ts.createTypeReferenceNode(subModuleName, undefined),
                undefined,
              );
            })),
            ts.createProperty(
              undefined,
              ts.createModifiersFromModifierFlags(ts.ModifierFlags.Private),
              '_msio',
              undefined,
              msioInstanceTypeNode,
              undefined,
            ),
            ts.createProperty(
              undefined,
              ts.createModifiersFromModifierFlags(ts.ModifierFlags.Private),
              '_service',
              undefined,
              ts.createTypeReferenceNode('number', undefined),
              undefined,
            ),
            ts.createConstructor(undefined, undefined, [
              ts.createParameter(undefined, undefined, undefined, 'msio', undefined, msioInstanceTypeNode),
              ts.createParameter(undefined, undefined, undefined, 'destination', undefined, ts.createTypeLiteralNode([
                ts.createPropertySignature(undefined, 'service', undefined, ts.createTypeReferenceNode('number', undefined), undefined),
                ts.createPropertySignature(undefined, 'baseURL', undefined, ts.createTypeReferenceNode('string', undefined), undefined),
                ts.createPropertySignature(undefined, 'pulseInterval', questionToken, ts.createTypeReferenceNode('number', undefined), undefined),
                ts.createPropertySignature(undefined, 'options', questionToken, ts.createTypeReferenceNode('IMSQueueOptionalOptions', undefined), undefined),
              ])),
            ], ts.createBlock([
              ts.createExpressionStatement(ts.createCall(ts.createPropertyAccess(ts.createIdentifier('msio'), 'addDestination'), [], [
                ts.createPropertyAccess(ts.createIdentifier('destination'), 'service'),
                ts.createPropertyAccess(ts.createIdentifier('destination'), 'baseURL'),
                ts.createLogicalOr(ts.createPropertyAccess(ts.createIdentifier('destination'), 'pulseInterval'), ts.createNumericLiteral('10000')),
                ts.createPropertyAccess(ts.createIdentifier('destination'), 'options'),
              ])),
              ts.createExpressionStatement(ts.createAssignment(ts.createPropertyAccess(ts.createThis(), '_msio'), ts.createIdentifier('msio'))),
              ts.createExpressionStatement(ts.createAssignment(ts.createPropertyAccess(ts.createThis(), '_service'), ts.createPropertyAccess(ts.createIdentifier('destination'), 'service'))),
            ], true)),
            ...(doc.apis.reduce<ts.ClassElement[]>((memo, api) => {
              // msio ignore version, only use the default version.
              if (!('default' in api.version)) {
                return memo;
              }
              const apiPath = api.path.replace(new RegExp(`^${basePath}`), '');
              // msio ignore params in path
              if (apiPath.indexOf(':') >= 0) {
                return memo;
              }
              // msio only use GET/PUT/POST methods.
              const method = api.method.toUpperCase();
              if (!['GET', 'PUT', 'POST'].includes(method)) {
                return memo;
              }
              const apiNameSuffix = {
                GET: 'Fetcher',
                PUT: 'Dispatcher',
                POST: 'Requester',
              }[method as 'GET' | 'PUT' | 'POST'];
              const apiData = api.version.default;
              const apiName = apiPath.slice(1).split('/').map((e, index) => {
                if (!e) {
                  return 'root';
                }
                return index === 0 ? e : headToUpperCase(e);
              }).join('').replace(/\./g, 'Dot') + apiNameSuffix;
              // ignore params type
              const queryTypeNode = schemaSummaryToTypeNode(apiData.query, typeNodes, `${apiName}Query`);
              const bodyTypeNode = schemaSummaryToTypeNode(apiData.body, typeNodes, `${apiName}Body`);
              const responseTypeNode = schemaSummaryToTypeNode(apiData.res, typeNodes, `${apiName}Response`);
              const responseTypeNodeCheckOptional = apiData.res?.required ? responseTypeNode : ts.createUnionTypeNode([responseTypeNode, ts.createTypeReferenceNode('undefined', undefined)]);
              const parameters: ts.ParameterDeclaration[] = [];
              const apiPathExpression = ts.createStringLiteral(apiPath);
              // only reader use query
              const isFetcher = apiNameSuffix === 'Fetcher';
              if (isFetcher && apiData.query) {
                parameters.push(ts.createParameter(undefined, undefined, undefined, 'params', apiData.query.required ? undefined : questionToken, queryTypeNode, undefined));
              }
              // only dispatcher & requester use body
              const isDispatcher = apiNameSuffix === 'Dispatcher';
              const isRequester = apiNameSuffix === 'Requester';
              if ((isDispatcher || isRequester) && apiData.body) {
                parameters.push(ts.createParameter(undefined, undefined, undefined, 'body', apiData.body.required ? undefined : questionToken, bodyTypeNode, undefined));
              }
              // method statements
              const statements: ts.Statement[] = [];
              if (isFetcher) {
                statements.push(ts.createReturn(ts.createCall(
                  ts.createPropertyAccess(ts.createThis(), '_fetcherWrapper'),
                  [responseTypeNodeCheckOptional],
                  [apiPathExpression, ts.createIdentifier('params')],
                )));
              } else if (isDispatcher) {
                statements.push(ts.createReturn(ts.createCall(
                  ts.createPropertyAccess(ts.createThis(), '_dispatcherWrapper'),
                  undefined,
                  [apiPathExpression, ts.createIdentifier('body')],
                )));
              } else if (isRequester) {
                statements.push(ts.createReturn(ts.createCall(
                  ts.createPropertyAccess(ts.createThis(), '_requesterWrapper'),
                  undefined,
                  [apiPathExpression, ts.createIdentifier('body')],
                )));
              }
              memo.push(ts.addSyntheticLeadingComment(ts.createMethod(
                undefined,
                ts.createModifiersFromModifierFlags(ts.ModifierFlags.Public),
                undefined,
                apiName,
                undefined,
                undefined,
                parameters,
                undefined,
                ts.createBlock(statements, true),
              ), ts.SyntaxKind.SingleLineCommentTrivia, ` [${apiNameSuffix}] ${apiData.name} `, true));
              return memo;
            }, [])),
            ts.createMethod(undefined, ts.createModifiersFromModifierFlags(ts.ModifierFlags.Private), undefined, '_dispatcherWrapper', undefined, undefined, [
              ts.createParameter(undefined, undefined, undefined, 'path', undefined, ts.createTypeReferenceNode('string', undefined), undefined),
              ts.createParameter(undefined, undefined, undefined, 'body', undefined, ts.createTypeReferenceNode('IBody', undefined), ts.createObjectLiteral()),
            ], undefined, ts.createBlock([ts.createReturn(ts.createObjectLiteral([
              ts.createPropertyAssignment('dispatch', ts.createArrowFunction(ts.createModifiersFromModifierFlags(ts.ModifierFlags.Async), undefined, [
                ts.createParameter(undefined, undefined, undefined, 'session', questionToken, clientSessionTypeNode, undefined),
                ts.createParameter(undefined, undefined, undefined, 'producer', undefined, undefined, ts.createStringLiteral('UNKNOWN')),
              ], undefined, undefined, ts.createBlock([
                ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), '_msio.write'), undefined, [
                  ts.createPropertyAccess(ts.createThis(), '_service'),
                  ts.createIdentifier('path'),
                  ts.createIdentifier('body'),
                  ts.createIdentifier('producer'),
                  ts.createIdentifier('session'),
                ])),
              ], true))),
              ts.createPropertyAssignment('orderedDispatch', ts.createArrowFunction(ts.createModifiersFromModifierFlags(ts.ModifierFlags.Async), undefined, [
                ts.createParameter(undefined, undefined, undefined, 'depends', undefined, ts.createTypeReferenceNode('ObjectId', undefined), undefined),
                ts.createParameter(undefined, undefined, undefined, 'session', questionToken, clientSessionTypeNode, undefined),
                ts.createParameter(undefined, undefined, undefined, 'producer', undefined, undefined, ts.createStringLiteral('UNKNOWN')),
              ], undefined, undefined, ts.createBlock([
                ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), '_msio.orderedWrite'), undefined, [
                  ts.createPropertyAccess(ts.createThis(), '_service'),
                  ts.createIdentifier('depends'),
                  ts.createIdentifier('path'),
                  ts.createIdentifier('body'),
                  ts.createIdentifier('producer'),
                  ts.createIdentifier('session'),
                ])),
              ], true))),
            ], true))], true)),
            ts.createMethod(undefined, ts.createModifiersFromModifierFlags(ts.ModifierFlags.Private), undefined, '_fetcherWrapper', undefined, [ts.createTypeParameterDeclaration('T')], [
              ts.createParameter(undefined, undefined, undefined, 'path', undefined, ts.createTypeReferenceNode('string', undefined), undefined),
              ts.createParameter(undefined, undefined, undefined, 'params', undefined, ts.createTypeReferenceNode('IParams', undefined), ts.createObjectLiteral()),
            ], undefined, ts.createBlock([ts.createReturn(ts.createObjectLiteral([
              ts.createPropertyAssignment('weakFetch', ts.createArrowFunction(ts.createModifiersFromModifierFlags(ts.ModifierFlags.Async), undefined, [
                ts.createParameter(undefined, undefined, undefined, 'defaultValue', undefined, ts.createTypeReferenceNode('T', undefined), undefined),
              ], undefined, undefined, ts.createBlock([
                ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), '_msio.weakRead'), [ts.createTypeReferenceNode('T', undefined)], [
                  ts.createPropertyAccess(ts.createThis(), '_service'),
                  ts.createIdentifier('defaultValue'),
                  ts.createIdentifier('path'),
                  ts.createIdentifier('params'),
                ])),
              ], true))),
              ts.createPropertyAssignment('fetch', ts.createArrowFunction(ts.createModifiersFromModifierFlags(ts.ModifierFlags.Async), undefined, [], undefined, undefined, ts.createBlock([
                ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), '_msio.read'), [ts.createTypeReferenceNode('T', undefined)], [
                  ts.createPropertyAccess(ts.createThis(), '_service'),
                  ts.createIdentifier('path'),
                  ts.createIdentifier('params'),
                ])),
              ], true))),
            ], true))], true)),
            ts.createMethod(undefined, ts.createModifiersFromModifierFlags(ts.ModifierFlags.Private), undefined, '_requesterWrapper', undefined, [ts.createTypeParameterDeclaration('T')], [
              ts.createParameter(undefined, undefined, undefined, 'path', undefined, ts.createTypeReferenceNode('string', undefined), undefined),
              ts.createParameter(undefined, undefined, undefined, 'body', undefined, ts.createTypeReferenceNode('IBody', undefined), ts.createObjectLiteral()),
            ], undefined, ts.createBlock([ts.createReturn(ts.createObjectLiteral([
              ts.createPropertyAssignment('request', ts.createArrowFunction(ts.createModifiersFromModifierFlags(ts.ModifierFlags.Async), undefined, [], undefined, undefined, ts.createBlock([
                ts.createReturn(ts.createCall(ts.createPropertyAccess(ts.createThis(), '_msio.writeRead'), [ts.createTypeReferenceNode('T', undefined)], [
                  ts.createPropertyAccess(ts.createThis(), '_service'),
                  ts.createIdentifier('path'),
                  ts.createIdentifier('body'),
                ])),
              ], true))),
            ]))], true)),
          ],
        ),
        ts.SyntaxKind.MultiLineCommentTrivia,
        `\ntitle: ${doc.meta.title || 'UNKNOWN'}\ndescription: ${doc.meta.description || 'No description.'}\n`,
        true,
      );

      const code = printNodes([
        ...importNodes,
        ...typeNodes,
        classNode,
      ], true);

      emitToFile(code, moduleName);
      return moduleName;
    }

    await createModule(options.url, '/api.doc');
  }

  console.log('Created all modules done!');
}
