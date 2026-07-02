const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let anyRegex1 = /\(supabase as any\)/g;
let anyRegex2 = /:\s*any(\[\])?\s*[=,\)]/g;
let anyRegex3 = /<any>/g;
let unusedImageRegex = /import\s+Image\s+from\s+["']next\/image["'];/g;
let unusedLinkRegex = /import\s+Link\s+from\s+["']next\/link["'];/g;
let unusedLucideRegex = /import\s+\{[^}]*\}\s+from\s+["']lucide-react["'];/g; // Not safe to blindly remove, but let's be careful.

walkDir('src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Replace (supabase as any) with supabase
    content = content.replace(anyRegex1, 'supabase');

    // 2. Replace : any[] with : any[] ? No, replace explicit any
    // actually, let's replace `(product: any)` with `(product: Record<string, unknown>)`
    content = content.replace(/\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*\)/g, '($1: Record<string, unknown>)');
    content = content.replace(/\(\s*([a-zA-Z0-9_]+)\s*:\s*any\s*,\s*([a-zA-Z0-9_]+)\s*:\s*number\s*\)/g, '($1: Record<string, unknown>, $2: number)');
    content = content.replace(/:\s*any\[\]\s*=/g, ': Record<string, unknown>[] =');
    content = content.replace(/:\s*any\s*=/g, ': unknown =');
    content = content.replace(/Promise<any>/g, 'Promise<unknown>');
    content = content.replace(/useState<any>/g, 'useState<Record<string, unknown> | null>');
    content = content.replace(/as any/g, 'as unknown'); // blanket for leftover `as any`

    // 3. Fix unescaped quotes in JSX text
    // Replace ' in JSX text with &apos;
    // Replace " in JSX text with &quot;
    // This is hard to do safely with regex. 

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed types in:', filePath);
    }
  }
});
