import codemods from '../codemods.json';
import type { CodemodCommand } from './command.js';
import { phaseToUsephaseCommand } from './migrations/phase-to-usephase/command.js';

const implementations = [
  { id: 'phase-to-usephase', command: phaseToUsephaseCommand },
] as const satisfies readonly { id: string; command: CodemodCommand }[];

function registerCommands() {
  const implementationsById = new Map<string, CodemodCommand>();
  for (const implementation of implementations) {
    if (implementationsById.has(implementation.id)) {
      throw new Error(`Duplicate command implementation: ${implementation.id}`);
    }
    implementationsById.set(implementation.id, implementation.command);
  }

  const catalogIds = new Set<string>();
  const catalogNames = new Set<string>();
  const registered = codemods.map((metadata) => {
    if (!metadata.id.trim()) {
      throw new Error('Codemod catalog entry must have a non-empty id');
    }
    if (catalogIds.has(metadata.id)) {
      throw new Error(`Duplicate codemod id: ${metadata.id}`);
    }
    if (!metadata.name.trim()) {
      throw new Error('Codemod catalog entry must have a non-empty name');
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)) {
      throw new Error(`Invalid codemod command name: ${metadata.name}`);
    }
    if (catalogNames.has(metadata.name)) {
      throw new Error(`Duplicate codemod name: ${metadata.name}`);
    }
    catalogIds.add(metadata.id);
    catalogNames.add(metadata.name);

    const implementation = implementationsById.get(metadata.id);
    if (!implementation) {
      throw new Error(`Missing command implementation: ${metadata.id}`);
    }
    return {
      id: metadata.id,
      name: metadata.name,
      summary: metadata.summary,
      execute: implementation.execute,
    };
  });

  for (const implementation of implementations) {
    if (!catalogIds.has(implementation.id)) {
      throw new Error(`Command is missing from catalog: ${implementation.id}`);
    }
  }
  return registered;
}

export const commands = registerCommands();
