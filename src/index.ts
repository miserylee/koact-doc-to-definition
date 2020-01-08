import Axios, { Method } from 'axios';
import { rmdirSync } from 'fs';
import { ensureDirSync, writeFileSync } from 'fs-extra';
import { parse, resolve } from 'path';
import { ISummary } from 'schema.io';
import ts = require('typescript');

export interface IOptions {
  url: string;
  destination: string;
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

async function fetchDoc(baseUrl: string, path: string) {
  const { data } = await Axios.get<IKoactDoc>(`${baseUrl}${path}`);
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
  console.log(`Use typescript v:${ts.version}`);
  console.log('Clear destination.');
  rmdirSync(options.destination, { recursive: true });
  console.log(`Ensure destination: ${options.destination}`);
  ensureDirSync(options.destination);

  function emitToFile(code: string, moduleName: string) {
    writeFileSync(resolve(options.destination, `${moduleName}.ts`), code);
    console.log(`Emit module: ${moduleName}`);
  }

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
    console.log('Create module:', moduleName);
    const doc = await fetchDoc(baseUrl, path);

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
              const apiName = api.method.toLowerCase() + api.path.slice(1).split('/').map(e => {
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
              let apiPathExpression: ts.Expression = ts.createStringLiteral(api.path);
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
                ` [version:${version}] ${apiData.name} ${api.method.toUpperCase()} ${api.path}`,
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

  console.log('Created all modules done!');
}
