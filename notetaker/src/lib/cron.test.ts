import { describe, expect, it } from "vitest";
import { getCronConfig, isCronAuthorized } from "./cron";

describe("cron helpers", () => {
  it("parses defaults and bounds batch size", () => {
    expect(getCronConfig({} as NodeJS.ProcessEnv)).toEqual({
      secret: "",
      meetingBatchSize: 1,
    });

    expect(
      getCronConfig({
        CRON_SECRET: "   abc123   ",
        CRON_MEETING_BATCH_SIZE: "500",
      }),
    ).toEqual({
      secret: "abc123",
      meetingBatchSize: 20,
    });
  });

  it("validates bearer secret", () => {
    const req = new Request("https://example.com/api/cron/process", {
      method: "GET",
      headers: {
        authorization: "Bearer right-secret",
      },
    });

    expect(isCronAuthorized(req, { CRON_SECRET: "right-secret" })).toBe(true);
    expect(isCronAuthorized(req, { CRON_SECRET: "wrong-secret" })).toBe(false);
    expect(isCronAuthorized(req, {})).toBe(false);
  });
});
