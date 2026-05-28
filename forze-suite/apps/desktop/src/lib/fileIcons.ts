import {
  FileCode2,
  FileJson,
  FileText,
  FileType,
  Hash,
  Component,
  Cog,
  Database,
  Braces,
  type LucideIcon,
} from 'lucide-react';

/** Pick a sensible Lucide icon for a Monaco language id. */
export function iconForLanguage(language: string): LucideIcon {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return FileCode2;
    case 'json':
      return Braces;
    case 'markdown':
      return FileText;
    case 'css':
    case 'scss':
    case 'less':
      return Hash;
    case 'html':
      return Component;
    case 'rust':
      return Cog;
    case 'sql':
      return Database;
    case 'yaml':
    case 'toml':
      return FileType;
    default:
      return FileJson;
  }
}
