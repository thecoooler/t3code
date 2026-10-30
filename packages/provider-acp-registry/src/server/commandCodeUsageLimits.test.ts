import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { AcpRegistrySettings } from "../settings.ts";
import {
  readCommandCodeUsageLimits,
  usesCommandCodeUsageLimits,
} from "./commandCodeUsageLimits.ts";

const decodeSettings = Schema.decodeSync(AcpRegistrySettings);

function setup() {
  const files = new Map([
    ["/instance/.commandcode/auth.json", JSON.stringify({ apiKey: "saved-key" })],
  ]);
  const reads: string[] = [];
  const requests: Array<{ url: string; authorization: string | undefined; orgId: string | null }> =
    [];
  let status = 200;
  let body: unknown = {
    windowLimits: {
      limited: true,
      fiveHour: { used: 1.5, cap: 3, resetAt: 0 },
      weekly: { used: 1.5, cap: 6, resetAt: 1793129361273 },
    },
  };
  const fs = FileSystem.makeNoop({
    readFileString: (path) =>
      Effect.sync(() => {
        reads.push(path);
        return files.get(path) ?? "{}";
      }),
  });
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const orgId = [...request.urlParams].find(([name]) => name === "orgId")?.[1];
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        orgId: typeof orgId === "string" ? orgId : null,
      });
      return HttpClientResponse.fromWeb(
        request,
        Response.json(request.url.endsWith("/whoami") ? { org: { id: "org-1" } } : body, {
          status,
        }),
      );
    }),
  );
  return {
    files,
    reads,
    requests,
    setStatus: (next: number) => {
      status = next;
    },
    setBody: (next: unknown) => {
      body = next;
    },
    read: (environment: NodeJS.ProcessEnv = {}, args: ReadonlyArray<string> = []) =>
      readCommandCodeUsageLimits({ environment: { HOME: "/instance", ...environment }, args }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.provide(NodeServices.layer),
      ),
  };
}

describe("Command Code usage limits", () => {
  it.each([
    [{ agentId: "command-code" }, true],
    [{ agentId: "other-agent", commandPath: "command-code" }, false],
    [{ source: "local", commandPath: "/opt/bin/command-code" }, true],
    [{ source: "local", commandPath: "C:\\tools\\command-code.cmd" }, true],
    [{ source: "local", commandPath: "cmd", commandArgs: ["acp"] }, true],
    [{ source: "local", commandPath: "C:\\Windows\\cmd.exe", commandArgs: ["/c", "agent"] }, false],
    [{ source: "local", commandPath: "wrapper", usageLimitsSource: "commandCode" }, true],
    [{ agentId: "command-code", usageLimitsSource: "none" }, false],
  ] as const)("selects the account limit source for %j", (settings, enabled) => {
    expect(usesCommandCodeUsageLimits(decodeSettings(settings))).toBe(enabled);
  });

  it.effect(
    "reads the instance's saved credentials and organization without starting an agent",
    () =>
      Effect.gen(function* () {
        const test = setup();
        const limits = yield* test.read();
        expect(limits.unavailable).toBeUndefined();
        expect(limits.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(limits.windows).toEqual([
          {
            id: "command_code_five_hour",
            kind: "session",
            label: "Command Code · 5-hour",
            windowDurationMins: 300,
            usedPercent: 50,
          },
          {
            id: "command_code_weekly",
            kind: "weekly",
            label: "Command Code · Weekly",
            windowDurationMins: 10080,
            usedPercent: 25,
            resetsAt: "2026-10-27T19:29:21.273Z",
          },
        ]);
        expect(test.requests).toEqual([
          {
            url: "https://api.commandcode.ai/alpha/whoami",
            authorization: "Bearer saved-key",
            orgId: null,
          },
          {
            url: "https://api.commandcode.ai/alpha/billing/credits",
            authorization: "Bearer saved-key",
            orgId: "org-1",
          },
        ]);
        expect(test.reads).toEqual([
          "/instance/.commandcode/config.json",
          "/instance/.commandcode/auth.json",
        ]);
      }),
  );

  it.effect("prefers the environment key without reading a broken saved auth file", () =>
    Effect.gen(function* () {
      const test = setup();
      test.files.set("/instance/.commandcode/auth.json", "broken json");
      const result = yield* test.read({ COMMAND_CODE_API_KEY: " env-key " });
      expect(result.windows).toHaveLength(2);
      expect(test.requests.map((request) => request.authorization)).toEqual([
        "Bearer env-key",
        "Bearer env-key",
      ]);
      expect(test.reads).not.toContain("/instance/.commandcode/auth.json");
    }),
  );

  it.effect("does not query an account when signed out or in local-only mode", () =>
    Effect.gen(function* () {
      const test = setup();
      test.files.delete("/instance/.commandcode/auth.json");
      expect((yield* test.read()).unavailable?.reason).toBe("unsupported");
      for (const [environment, args] of [
        [{ CMD_LOCAL_ONLY: "1" }, []],
        [{}, ["--local-only"]],
        [{ COMMANDCODE_API_ENV: "local" }, []],
        [{ COMMANDCODE_SANDBOX: "true" }, []],
      ] as const) {
        expect(
          (yield* test.read({ COMMAND_CODE_API_KEY: "key", ...environment }, args)).unavailable
            ?.reason,
        ).toBe("unsupported");
      }
      test.files.set("/instance/.commandcode/config.json", JSON.stringify({ localOnly: true }));
      expect((yield* test.read({ COMMAND_CODE_API_KEY: "key" })).unavailable?.reason).toBe(
        "unsupported",
      );
      expect(test.requests).toEqual([]);
    }),
  );

  it.effect("uses staging credentials only with the staging API", () =>
    Effect.gen(function* () {
      const test = setup();
      test.files.set(
        "/instance/.commandcode/auth.staging.json",
        JSON.stringify({ apiKey: "staging-key" }),
      );
      const result = yield* test.read({ COMMANDCODE_API_ENV: "staging" });
      expect(result.windows).toHaveLength(2);
      expect(test.requests[0]).toMatchObject({
        url: "https://staging-api.commandcode.ai/alpha/whoami",
        authorization: "Bearer staging-key",
      });
      expect(test.reads).not.toContain("/instance/.commandcode/auth.json");
    }),
  );

  it.effect("clamps exhausted windows and omits windows with no allowance", () =>
    Effect.gen(function* () {
      const test = setup();
      test.setBody({
        windowLimits: {
          limited: true,
          fiveHour: { used: 7, cap: 3, resetAt: 0 },
          weekly: { used: 0, cap: 0, resetAt: 0 },
        },
      });
      const result = yield* test.read();
      expect(result.windows).toHaveLength(1);
      expect(result.windows[0]?.usedPercent).toBe(100);
    }),
  );

  it.effect("clears windows when the API reports no plan limits", () =>
    Effect.gen(function* () {
      const test = setup();
      for (const windowLimits of [null, { limited: false }]) {
        test.setBody({ windowLimits });
        const result = yield* test.read();
        expect(result.windows).toEqual([]);
        expect(result.unavailable).toBeUndefined();
      }
    }),
  );

  it.effect(
    "reports HTTP and malformed response failures without exposing credentials or payloads",
    () =>
      Effect.gen(function* () {
        const test = setup();
        for (const status of [401, 403, 429, 500]) {
          test.setStatus(status);
          const result = yield* test.read();
          expect(result.windows).toEqual([]);
          expect(result.unavailable).toEqual({
            reason: "probeFailed",
            message: "Command Code could not read usage limits.",
          });
          expect(result.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
          expect(JSON.stringify(result)).not.toContain("saved-key");
        }
        test.setStatus(200);
        test.setBody({
          windowLimits: { limited: true, fiveHour: { used: -1, cap: 3, resetAt: 0 } },
        });
        expect((yield* test.read()).unavailable?.reason).toBe("probeFailed");
        test.files.set("/instance/.commandcode/auth.json", "broken");
        expect((yield* test.read()).unavailable?.reason).toBe("probeFailed");
      }),
  );

  it.effect("rereads credentials and usage on refresh and distinguishes different accounts", () =>
    Effect.gen(function* () {
      const test = setup();
      const first = yield* test.read();
      test.files.set("/instance/.commandcode/auth.json", JSON.stringify({ apiKey: "another-key" }));
      test.setBody({ windowLimits: { limited: true, fiveHour: { used: 0, cap: 3, resetAt: 0 } } });
      const second = yield* test.read();
      expect(second.credentialFingerprint).not.toBe(first.credentialFingerprint);
      expect(second.windows[0]?.usedPercent).toBe(0);
      expect(test.requests[2]?.authorization).toBe("Bearer another-key");
    }),
  );
});
