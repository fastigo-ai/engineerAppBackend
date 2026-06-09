import fs from 'fs';
import path from 'path';

function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules') continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findJsFiles(fullPath, fileList);
    } else if (fullPath.endsWith('.js')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const jsFiles = findJsFiles(path.join(process.cwd(), 'src'));
const brokenImports = [];

const importRegex = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const file of jsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2] || match[3];
    
    // We only care about relative imports
    if (importPath && (importPath.startsWith('./') || importPath.startsWith('../'))) {
      const dir = path.dirname(file);
      let resolvedPath = path.resolve(dir, importPath);
      
      // Node.js allows omitting extensions or adding .js
      const possiblePaths = [
        resolvedPath,
        resolvedPath + '.js',
        resolvedPath + '.json',
        path.join(resolvedPath, 'index.js')
      ];

      let found = false;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          found = true;
          break;
        }
      }

      if (!found) {
        brokenImports.push({ file, importPath, resolvedPath });
      }
    }
  }
}

if (brokenImports.length > 0) {
  console.log(`Found ${brokenImports.length} broken relative imports:`);
  for (const bi of brokenImports) {
    const relativeFile = path.relative(process.cwd(), bi.file);
    console.log(`\nFile: ${relativeFile}`);
    console.log(`Broken Import: "${bi.importPath}"`);
  }
} else {
  console.log('No broken relative imports found!');
}
