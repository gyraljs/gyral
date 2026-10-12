// Import- and scope-aware mechanical 0.3.1 migration. Never guess clock semantics.
import ts from 'typescript';

export function migrateGyral(code, filename = 'component.ts') {
  const options = { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
  const source = ts.createSourceFile(filename, code, options.target, true);
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (path) => (path === filename ? source : undefined);
  const checker = ts.createProgram([filename], options, host).getTypeChecker();
  const edits = [];
  const warnings = [];
  const calls = [];
  const imports = new Map();
  const bindings = new Map();
  function visit(node, fn) {
    fn(node);
    ts.forEachChild(node, (child) => visit(child, fn));
  }
  visit(source, (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@gyral/core') {
      const named = node.importClause?.namedBindings;
      if (named !== undefined && ts.isNamedImports(named)) {
        for (const spec of named.elements) {
          imports.set(
            checker.getSymbolAtLocation(spec.name),
            (spec.propertyName ?? spec.name).text,
          );
          bindings.set((spec.propertyName ?? spec.name).text, spec);
        }
      } else if (named !== undefined) imports.set(checker.getSymbolAtLocation(named.name), '*');
    }
    if (ts.isCallExpression(node)) calls.push(node);
  });
  function core(expression, name) {
    if (ts.isIdentifier(expression))
      return imports.get(checker.getSymbolAtLocation(expression)) === name;
    if (ts.isQualifiedName(expression))
      return (
        expression.right.text === name &&
        imports.get(checker.getSymbolAtLocation(expression.left)) === '*'
      );
    return (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === name &&
      imports.get(checker.getSymbolAtLocation(expression.expression)) === '*'
    );
  }
  const edit = (start, end, text) => edits.push({ start, end, text });
  function warn(node, message) {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    warnings.push(`${filename}:${line + 1}:${character + 1}: ${message}`);
  }
  const definitions = [];
  for (const call of calls) {
    const old = core(call.expression, 'define');
    const curry =
      ts.isCallExpression(call.expression) &&
      core(call.expression.expression, 'define') &&
      call.expression.arguments.length === 0;
    if (!old && !curry) continue;
    if (call.arguments.length === 0) continue;
    if (call.arguments.length !== 2) {
      warn(call, 'define: expected tag and spec; review this call manually');
      continue;
    }
    if (old) {
      const paren = call.getChildren(source).find((n) => n.kind === ts.SyntaxKind.OpenParenToken);
      if (paren === undefined) throw new Error('Missing define call parenthesis');
      edit(paren.getStart(source), paren.getStart(source), '()');
    }
    const typed = old ? call : call.expression;
    if (ts.isVariableDeclaration(call.parent) && ts.isIdentifier(call.parent.name))
      definitions.push({
        call,
        name: call.parent.name.text,
        message: typed.typeArguments?.[1]?.getText(source),
      });
  }

  const intentCalls = calls.filter((c) => core(c.expression, 'intents'));
  const matches = intentCalls.map((call) => {
    const message = call.typeArguments?.[0]?.getText(source);
    const found = definitions.filter((d) => message !== undefined && d.message === message);
    if (
      call.arguments.length !== 0 ||
      found.length !== 1 ||
      !ts.isVariableDeclaration(call.parent) ||
      !ts.isIdentifier(call.parent.name)
    ) {
      warn(
        call,
        'intents: needs one local component with this message type and a named constant; use intentsOf<typeof Component>() manually',
      );
      return undefined;
    }
    return { call, definition: found[0], variable: call.parent };
  });
  // Changing an imported helper affects all its uses, so migrate this group atomically.
  let indirectIntents = false;
  visit(source, (node) => {
    if (!core(node, 'intents') || ts.isImportSpecifier(node.parent)) return;
    if (
      ts.isCallExpression(node.parent) &&
      node.parent.expression === node &&
      intentCalls.includes(node.parent)
    )
      return;
    indirectIntents = true;
    warn(
      node,
      'intents is used indirectly; review all helper references before replacing its import',
    );
  });
  if (!indirectIntents && matches.length > 0 && matches.every((m) => m !== undefined)) {
    const renamed = new Set();
    for (const { call } of matches) {
      const spec = checker.getSymbolAtLocation(call.expression)?.declarations?.[0];
      if (spec !== undefined && ts.isImportSpecifier(spec) && !renamed.has(spec)) {
        edit(spec.getStart(source), spec.end, `intentsOf as ${spec.name.text}`);
        renamed.add(spec);
      }
    }
    for (const { call, definition, variable } of matches) {
      const expression = call.expression;
      if (ts.isPropertyAccessExpression(expression))
        edit(expression.name.getStart(source), expression.name.end, 'intentsOf');
      const type = call.typeArguments?.[0];
      if (type === undefined) throw new Error('Missing intents type');
      edit(type.getStart(source), type.end, `typeof ${definition.name}`);
      const specNode = definition.call.arguments[1];
      if (!ts.isObjectLiteralExpression(specNode)) {
        warn(
          call,
          "Review view helpers: add TemplateResult return types and use view's own intent parameter",
        );
        continue;
      }
      const view = specNode.properties.find((p) => p.name?.getText(source) === 'view');
      const fn = view !== undefined && ts.isPropertyAssignment(view) ? view.initializer : view;
      if (
        fn !== undefined &&
        (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn))
      ) {
        const name = variable.name.getText(source);
        const symbol = checker.getSymbolAtLocation(variable.name);
        const references = [];
        visit(fn.body, (node) => {
          if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === symbol)
            references.push(node);
        });
        if (references.length > 0) {
          if (fn.parameters.length >= 2 && ts.isIdentifier(fn.parameters[1].name)) {
            for (const ref of references)
              edit(ref.getStart(source), ref.end, fn.parameters[1].name.text);
          } else if (fn.parameters.length === 1) {
            const paren = fn
              .getChildren(source)
              .find((n) => n.kind === ts.SyntaxKind.CloseParenToken);
            if (paren !== undefined)
              edit(paren.getStart(source), paren.getStart(source), `, ${name}`);
            else {
              const param = fn.parameters[0];
              edit(param.getStart(source), param.getStart(source), '(');
              edit(param.end, param.end, `, ${name})`);
            }
          } else
            warn(fn, "Use the view's second parameter for intent names to avoid cyclic inference");
        }
      }
    }
    let resultName = bindings.get('TemplateResult')?.name.text;
    let addedResult = false;
    const annotated = new Set();
    for (const call of calls.filter((c) => core(c.expression, 'each'))) {
      const row = call.arguments[2];
      if (row === undefined || !ts.isIdentifier(row)) continue;
      const symbol = checker.getSymbolAtLocation(row);
      const declaration = symbol?.declarations?.[0];
      const fn =
        declaration !== undefined && ts.isVariableDeclaration(declaration)
          ? declaration.initializer
          : declaration;
      if (
        fn === undefined ||
        (!ts.isArrowFunction(fn) && !ts.isFunctionDeclaration(fn)) ||
        fn.type !== undefined ||
        fn.body === undefined
      )
        continue;
      if (annotated.has(fn)) continue;
      const template =
        ts.isBlock(fn.body) &&
        fn.body.statements.length === 1 &&
        ts.isReturnStatement(fn.body.statements[0])
          ? fn.body.statements[0].expression
          : fn.body;
      if (
        template === undefined ||
        !ts.isTaggedTemplateExpression(template) ||
        !core(template.tag, 'html')
      ) {
        warn(fn, 'Row helper: add an explicit TemplateResult-compatible return type after review');
        continue;
      }
      if (resultName === undefined) {
        resultName = 'GyralTemplateResult';
        while (code.includes(resultName)) resultName += '_';
        addedResult = true;
      }
      const paren = fn.getChildren(source).find((n) => n.kind === ts.SyntaxKind.CloseParenToken);
      if (paren !== undefined) edit(paren.end, paren.end, `: ${resultName}`);
      else {
        const param = fn.parameters[0];
        edit(param.getStart(source), param.getStart(source), '(');
        edit(param.end, param.end, `): ${resultName}`);
      }
      annotated.add(fn);
    }
    if (addedResult)
      edit(
        code.length,
        code.length,
        `\nimport type { TemplateResult as ${resultName} } from '@gyral/core';\n`,
      );
  }
  visit(source, (node) => {
    if (ts.isTypeReferenceNode(node)) {
      for (const name of ['IntentName', 'Messages', 'IntentNames']) {
        if (core(node.typeName, name))
          warn(
            node,
            `${name}: review the message union/intent-name type using the migration guide; no unsafe type rewrite was made`,
          );
      }
    }
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@gyral/time') {
      const named = node.importClause?.namedBindings;
      if (named !== undefined && ts.isNamedImports(named)) {
        for (const spec of named.elements) {
          if ((spec.propertyName ?? spec.name).text === 'periodic')
            warn(
              spec,
              'periodic → every changes tick counts to epoch milliseconds and emits immediately; choose elapsed/count and pause/resume semantics before editing',
            );
        }
      }
    }
  });
  let output = code;
  let boundary = code.length;
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (e.end > boundary) throw new Error('Overlapping migration edits; no file written');
    output = output.slice(0, e.start) + e.text + output.slice(e.end);
    boundary = e.start;
  }
  return { code: output, edits: edits.length, warnings };
}
