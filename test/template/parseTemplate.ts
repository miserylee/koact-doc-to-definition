import * as path from 'path';
import ts = require('typescript');

const program = ts.createProgram([path.resolve(__dirname, 'template.ts')], {});

const sourceFile = program.getSourceFile(path.resolve(__dirname, 'template.ts'));

if (sourceFile) {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  ts.forEachChild(sourceFile, node => {
    console.log(node);
    console.log(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile));
    console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
  });
}
