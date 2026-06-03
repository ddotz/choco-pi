export const DEFAULT_HEADROOM_PYTHON = "/Users/hyuns/.local/share/uv/tools/headroom-ai/bin/python";

const HEADROOM_MCP_SCRIPT = [
  "import asyncio, json, os, sys, time",
  "from pathlib import Path",
  "from headroom.ccr.mcp_server import HeadroomMCPServer",
  "STORE_DIR = Path.home() / '.cache' / 'choco-pi' / 'headroom'",
  "STORE_TTL_SECONDS = 300",
  "payload = json.load(sys.stdin)",
  "server = HeadroomMCPServer(check_proxy=False)",
  "def _entry_path(hash_key):",
  "    if not isinstance(hash_key, str) or len(hash_key) != 24 or any(ch not in '0123456789abcdefABCDEF' for ch in hash_key):",
  "        raise ValueError('hash must be 24 hex characters')",
  "    return STORE_DIR / f'{hash_key.lower()}.json'",
  "def _save(hash_key, result, original):",
  "    STORE_DIR.mkdir(parents=True, exist_ok=True)",
  "    os.chmod(STORE_DIR, 0o700)",
  "    path = _entry_path(hash_key)",
  "    data = {'hash': hash_key, 'created_at': time.time(), 'ttl': STORE_TTL_SECONDS, 'original_content': original, 'compressed': result.get('compressed'), 'original_tokens': result.get('original_tokens'), 'compressed_tokens': result.get('compressed_tokens'), 'tokens_saved': result.get('tokens_saved'), 'transforms': result.get('transforms')}",
  "    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)",
  "    with os.fdopen(fd, 'w', encoding='utf8') as handle:",
  "        json.dump(data, handle, ensure_ascii=False)",
  "    os.chmod(path, 0o600)",
  "def _retrieve(hash_key, query):",
  "    path = _entry_path(hash_key)",
  "    if not path.exists():",
  "        return {'error': 'Content not found in Pi Headroom store.', 'hash': hash_key}",
  "    data = json.loads(path.read_text(encoding='utf8'))",
  "    if time.time() - float(data.get('created_at', 0)) > int(data.get('ttl', STORE_TTL_SECONDS)):",
  "        path.unlink(missing_ok=True)",
  "        return {'error': 'Content expired in Pi Headroom store.', 'hash': hash_key}",
  "    if query:",
  "        needle = query.lower()",
  "        lines = [line for line in data.get('original_content', '').splitlines() if needle in line.lower()]",
  "        return {'hash': hash_key, 'source': 'pi-local', 'query': query, 'results': lines, 'count': len(lines)}",
  "    return {'hash': hash_key, 'source': 'pi-local', 'original_content': data.get('original_content', ''), 'original_tokens': data.get('original_tokens'), 'compressed_tokens': data.get('compressed_tokens')}",
  "if payload.get('action') == 'compress':",
  "    content = payload['content']",
  "    result = server._compress_content(content)",
  "    _save(result['hash'], result, content)",
  "elif payload.get('action') == 'retrieve':",
  "    result = _retrieve(payload['hash'], payload.get('query'))",
  "else:",
  "    raise ValueError('action must be compress or retrieve')",
  "print(json.dumps(result, ensure_ascii=False))",
].join("\n");

export interface HeadroomCompressInput {
  readonly content: string;
  readonly pythonPath?: string;
}

export interface HeadroomRetrieveInput {
  readonly hash: string;
  readonly query?: string;
  readonly pythonPath?: string;
}

export interface HeadroomCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdin: string;
}

export interface HeadroomProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export class HeadroomInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeadroomInputError";
  }
}

export function normalizeHeadroomContent(content: string): string {
  if (content.trim().length === 0) throw new HeadroomInputError("content is required");
  return content;
}

export function normalizeHeadroomHash(hash: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(normalized)) throw new HeadroomInputError("hash must be 24 hex characters");
  return normalized;
}

function normalizeOptionalQuery(query: string | undefined): string | undefined {
  if (query === undefined) return undefined;
  const trimmed = query.trim();
  return trimmed || undefined;
}

export function buildHeadroomCompressCommand(input: HeadroomCompressInput): HeadroomCommand {
  return {
    command: input.pythonPath ?? DEFAULT_HEADROOM_PYTHON,
    args: ["-c", HEADROOM_MCP_SCRIPT],
    stdin: `${JSON.stringify({ action: "compress", content: normalizeHeadroomContent(input.content) })}\n`,
  };
}

export function buildHeadroomRetrieveCommand(input: HeadroomRetrieveInput): HeadroomCommand {
  return {
    command: input.pythonPath ?? DEFAULT_HEADROOM_PYTHON,
    args: ["-c", HEADROOM_MCP_SCRIPT],
    stdin: `${JSON.stringify({ action: "retrieve", hash: normalizeHeadroomHash(input.hash), query: normalizeOptionalQuery(input.query) })}\n`,
  };
}

export function formatHeadroomCliResult(result: HeadroomProcessResult): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.exitCode === 0) return stdout;
  return `headroom exited ${result.exitCode}: ${stderr || stdout || "no output"}`;
}
