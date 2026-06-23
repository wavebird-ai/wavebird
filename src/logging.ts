export type WavebirdSdkLogLevel = "silent" | "error" | "warn" | "info" | "debug";

export type WavebirdSdkLogFn = (message: string, meta?: Record<string, unknown>) => void;

export type WavebirdSdkLogger = {
  error?: WavebirdSdkLogFn;
  warn?: WavebirdSdkLogFn;
  info?: WavebirdSdkLogFn;
  debug?: WavebirdSdkLogFn;
};

type LogMethod = Exclude<WavebirdSdkLogLevel, "silent">;

const LOG_LEVEL_ORDER: Record<WavebirdSdkLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function defaultConsoleLogger(): WavebirdSdkLogger | null {
  if (typeof console !== "object" || console === null) {
    return null;
  }
  return {
    ...(typeof console.error === "function" ? { error: console.error.bind(console) as WavebirdSdkLogFn } : {}),
    ...(typeof console.warn === "function" ? { warn: console.warn.bind(console) as WavebirdSdkLogFn } : {}),
    ...(typeof console.info === "function" ? { info: console.info.bind(console) as WavebirdSdkLogFn } : {}),
    ...(typeof console.debug === "function"
      ? { debug: console.debug.bind(console) as WavebirdSdkLogFn }
      : typeof console.log === "function"
        ? { debug: console.log.bind(console) as WavebirdSdkLogFn }
        : {}),
  };
}

function resolveLogLevel(
  logLevel: WavebirdSdkLogLevel | undefined,
  logger: WavebirdSdkLogger | undefined
): WavebirdSdkLogLevel {
  if (logLevel) {
    return logLevel;
  }
  return logger ? "error" : "silent";
}

export type SdkLoggerController = {
  level: WavebirdSdkLogLevel;
  log: (level: LogMethod, message: string, meta?: Record<string, unknown>) => void;
};

export function createSdkLogger(config: {
  logger?: WavebirdSdkLogger;
  logLevel?: WavebirdSdkLogLevel;
} = {}): SdkLoggerController {
  const level = resolveLogLevel(config.logLevel, config.logger);
  const logger = config.logger ?? defaultConsoleLogger();

  return {
    level,
    log(messageLevel, message, meta) {
      if (!logger || LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[messageLevel]) {
        return;
      }
      try {
        logger[messageLevel]?.(message, meta);
      } catch {
        // keep the SDK fail-silent even when user-supplied loggers throw
      }
    },
  };
}
