export type RequestLogger = {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
};

export function createRequestLogger(requestId: string): RequestLogger {
  const prefix = `[requestId=${requestId}]`;
  return {
    info: (msg, extra) => console.log(prefix, msg, extra ?? ''),
    warn: (msg, extra) => console.warn(prefix, msg, extra ?? ''),
    error: (msg, extra) => console.error(prefix, msg, extra ?? ''),
  };
}
