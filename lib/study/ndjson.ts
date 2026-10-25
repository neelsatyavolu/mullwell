// Parses JSON objects out of streamed model text as it arrives, so the first
// question can show before the rest are written. Objects are found by
// balanced braces (string-aware), so one-per-line, pretty-printed, fenced or
// array-wrapped output all work.

export function createObjectParser(onObject: (value: Record<string, unknown>) => void) {
  let buffer = "";
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let pos = 0;

  const emit = (raw: string) => {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) onObject(value);
    } catch {
      /* not valid JSON after all */
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      for (; pos < buffer.length; pos++) {
        const c = buffer[pos];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"' && depth > 0) inString = true;
        else if (c === "{") {
          if (depth === 0) start = pos;
          depth++;
        } else if (c === "}" && depth > 0) {
          depth--;
          if (depth === 0) {
            emit(buffer.slice(start, pos + 1));
            buffer = buffer.slice(pos + 1);
            pos = -1;
            start = -1;
          }
        }
      }
      // Keep memory flat while outside an object.
      if (depth === 0 && buffer.length > 0) {
        buffer = "";
        pos = 0;
      }
    },
    flush() {
      buffer = "";
      depth = 0;
      pos = 0;
      inString = false;
    },
  };
}

/** The first JSON object in a text, for tasks that answer with one object. */
export function firstObject(text: string): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const parser = createObjectParser((v) => (found ??= v));
  parser.push(text);
  return found;
}
