import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

describe("structured logger", () => {
  const originalLevel = process.env.LOG_LEVEL;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    process.env.LOG_LEVEL = originalLevel;
  });

  it("emits JSON with ts/level/event", () => {
    logger.info({ event: "boot", component: "test" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe("info");
    expect(payload.event).toBe("boot");
    expect(payload.component).toBe("test");
    expect(typeof payload.ts).toBe("string");
  });

  it("routes errors to console.error", () => {
    logger.error({ event: "boom" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("routes warnings to console.warn", () => {
    logger.warn({ event: "slow" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("respects LOG_LEVEL filtering", () => {
    process.env.LOG_LEVEL = "warn";
    logger.info({ event: "quiet" });
    logger.debug({ event: "quieter" });
    logger.warn({ event: "loud" });
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
