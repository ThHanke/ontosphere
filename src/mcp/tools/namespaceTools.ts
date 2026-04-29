// src/mcp/tools/namespaceTools.ts
import type { McpTool } from '../types';
import { rdfManager } from '@/utils/rdfManager';
import { normalizeEntry } from '@/constants/namespaces';

const addNamespace: McpTool = {
  name: 'addNamespace',
  description: 'Register a new IRI prefix so it can be used in abbreviated form in tool parameters (e.g. "myns:Alice" → "http://myns.org/Alice").',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: 'Prefix without colon (e.g. "myns")' },
      namespace: { type: 'string', description: 'Full IRI namespace ending with # or / (e.g. "http://myns.org/")' },
    },
    required: ['prefix', 'namespace'],
  },
  handler: async (params) => {
    try {
      const { prefix, namespace } = params as { prefix?: string; namespace?: string };
      if (!prefix) return { success: false, error: 'prefix is required' };
      if (!namespace) return { success: false, error: 'namespace is required' };
      const key = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;
      const existing = rdfManager.getNamespaces();
      if (existing.some(e => e.prefix === key)) {
        return { success: false, error: `Prefix "${key}:" already registered. Use updateNamespace to change it.` };
      }
      const entry = normalizeEntry({ prefix: key, uri: namespace });
      rdfManager.addNamespace(entry.prefix, entry.uri);
      return { success: true, data: { registered: `${key}: → ${namespace}` } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

const updateNamespace: McpTool = {
  name: 'updateNamespace',
  description: 'Change the IRI namespace bound to an existing prefix.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string' },
      namespace: { type: 'string' },
    },
    required: ['prefix', 'namespace'],
  },
  handler: async (params) => {
    try {
      const { prefix, namespace } = params as { prefix?: string; namespace?: string };
      if (!prefix) return { success: false, error: 'prefix is required' };
      if (!namespace) return { success: false, error: 'namespace is required' };
      const key = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;
      const existing = rdfManager.getNamespaces();
      if (!existing.some(e => e.prefix === key)) {
        return { success: false, error: `Prefix "${key}:" not found. Use addNamespace to register it first.` };
      }
      rdfManager.addNamespace(key, namespace);
      return { success: true, data: { updated: `${key}: → ${namespace}` } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

const removeNamespace: McpTool = {
  name: 'removeNamespace',
  description: 'Unregister an IRI prefix from the namespace registry.',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string' },
    },
    required: ['prefix'],
  },
  handler: async (params) => {
    try {
      const { prefix } = params as { prefix?: string };
      if (!prefix) return { success: false, error: 'prefix is required' };
      const key = prefix.endsWith(':') ? prefix.slice(0, -1) : prefix;
      const existing = rdfManager.getNamespaces();
      if (!existing.some(e => e.prefix === key)) {
        return { success: false, error: `Prefix "${key}:" not found` };
      }
      rdfManager.removeNamespace(key);
      return { success: true, data: { removed: `${key}:` } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

const listNamespaces: McpTool = {
  name: 'listNamespaces',
  description: 'Return all registered IRI prefixes and their namespace URIs.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    try {
      const entries = rdfManager.getNamespaces();
      const result: Record<string, string> = {};
      for (const e of entries) result[e.prefix + ':'] = e.uri;
      return { success: true, data: { content: JSON.stringify(result) } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

export const namespaceTools: McpTool[] = [addNamespace, updateNamespace, removeNamespace, listNamespaces];
