import Schema, { $ } from 'schema.io';
import ts = require('typescript');
import { printNodes, schemaSummaryToTypeNode } from '../src';

describe('Parser', () => {
  it('should success', () => {
    const schemaType = $({
      str: $(String).enums(['测试', '程序']),
      num: $(Number).enums([1, 2, 3]),
      bool: $(Boolean).enums([true, false]),
      mix: $().enums(['测试', 1, true]),
    });
    const typeNodes: ts.TypeNode[] = [];
    printNodes([schemaSummaryToTypeNode(new Schema(schemaType).summary(), typeNodes, 'Root')], false);
    printNodes(typeNodes, false);
  });
});
