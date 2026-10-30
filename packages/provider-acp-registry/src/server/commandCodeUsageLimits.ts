import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import {
  clampPercent,
  makeUnavailableUsageLimits,
  makeUsageLimits,
} from "@t3tools/provider-core/server/usageLimits";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Hex from "effect/encoding/Hex";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import type { AcpRegistrySettings } from "../settings.ts";

const AuthFile = Schema.Struct({ apiKey: Schema.optionalKey(Schema.String) });
const ConfigFile = Schema.Struct({ localOnly: Schema.optionalKey(Schema.Boolean) });
const Whoami = Schema.Struct({
  org: Schema.optionalKey(Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString }))),
});
const Window = Schema.Struct({
  used: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  cap: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  resetAt: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 8.64e15 })),
});
// /usage reports resetAt in milliseconds; zero means the window has not opened yet.
const Credits = Schema.Struct({
  windowLimits: Schema.NullOr(
    Schema.Struct({
      limited: Schema.Boolean,
      fiveHour: Schema.optionalKey(Schema.NullOr(Window)),
      weekly: Schema.optionalKey(Schema.NullOr(Window)),
    }),
  ),
});

export function usesCommandCodeUsageLimits(settings: AcpRegistrySettings): boolean {
  if (settings.usageLimitsSource !== "auto") return settings.usageLimitsSource === "commandCode";
  if (settings.source === "registry") return settings.agentId === "command-code";
  const executable = settings.commandPath.split(/[\\/]/).at(-1)?.toLowerCase();
  return (
    executable === "command-code" ||
    executable === "command-code.cmd" ||
    (executable === "cmd" && settings.commandArgs.includes("acp"))
  );
}

export const readCommandCodeUsageLimits = Effect.fn("CommandCodeUsageLimits.read")(
  function* (input: {
    readonly environment: NodeJS.ProcessEnv;
    readonly args: ReadonlyArray<string>;
  }) {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const unsupported = makeUnavailableUsageLimits({ checkedAt, reason: "unsupported" });
    const env = input.environment;
    const args = input.args;
    if (
      args.includes("--local-only") ||
      env.CMD_LOCAL_ONLY === "1" ||
      env.CMD_LOCAL_ONLY === "true" ||
      args.includes("--local") ||
      env.COMMANDCODE_API_ENV === "local" ||
      env.COMMANDCODE_SANDBOX === "true"
    )
      return unsupported;

    let credentialFingerprint: string | undefined;
    return yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = env.HOME ?? env.USERPROFILE ?? (yield* HostProcess.HomeDirectory);
      const staging = args.includes("--staging") || env.COMMANDCODE_API_ENV === "staging";
      const suffix = staging ? ".staging" : "";
      const baseUrl = staging ? "https://staging-api.commandcode.ai" : "https://api.commandcode.ai";
      const readFile = Effect.fn("CommandCodeUsageLimits.readFile")(function* (name: string) {
        return yield* fs
          .readFileString(path.join(home, ".commandcode", `${name}${suffix}.json`))
          .pipe(
            Effect.catchTags({
              PlatformError: (error) =>
                error.reason._tag === "NotFound" ? Effect.succeed("{}") : Effect.fail(error),
            }),
          );
      });
      const config = yield* readFile("config").pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ConfigFile))),
      );
      if (config.localOnly) return unsupported;
      const envKey = env.COMMAND_CODE_API_KEY?.trim();
      const key =
        envKey ||
        (yield* readFile("auth").pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(AuthFile))),
          Effect.map((auth) => auth.apiKey?.trim()),
        ));
      if (!key) return unsupported;

      const crypto = yield* Crypto.Crypto;
      credentialFingerprint = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(`command-code\0${baseUrl}\0${key}`))
        .pipe(Effect.map(Hex.encode), Effect.orDie);
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
      const request = HttpClientRequest.get(`${baseUrl}/alpha/whoami`).pipe(
        HttpClientRequest.setUrlParam("limits", "1"),
        HttpClientRequest.bearerToken(key),
      );
      const whoami = yield* client
        .execute(request)
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Whoami)));
      let creditsRequest = HttpClientRequest.get(`${baseUrl}/alpha/billing/credits`).pipe(
        HttpClientRequest.bearerToken(key),
      );
      if (whoami.org)
        creditsRequest = HttpClientRequest.setUrlParam(creditsRequest, "orgId", whoami.org.id);
      const credits = yield* client
        .execute(creditsRequest)
        .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Credits)));
      const windows: ServerProviderUsageWindow[] = [];
      if (credits.windowLimits?.limited) {
        for (const [id, kind, label, windowDurationMins, window] of [
          [
            "command_code_five_hour",
            "session",
            "Command Code · 5-hour",
            300,
            credits.windowLimits.fiveHour,
          ],
          [
            "command_code_weekly",
            "weekly",
            "Command Code · Weekly",
            10080,
            credits.windowLimits.weekly,
          ],
        ] as const) {
          if (!window || window.cap <= 0) continue;
          windows.push({
            id,
            kind,
            label,
            windowDurationMins,
            usedPercent: clampPercent((window.used / window.cap) * 100),
            ...(window.resetAt > 0
              ? { resetsAt: DateTime.formatIso(DateTime.makeUnsafe(window.resetAt)) }
              : {}),
          });
        }
      }
      return { ...makeUsageLimits({ checkedAt, windows }), credentialFingerprint };
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.orElseSucceed(() => ({
        ...makeUnavailableUsageLimits({
          checkedAt,
          reason: "probeFailed",
          message: "Command Code could not read usage limits.",
        }),
        ...(credentialFingerprint ? { credentialFingerprint } : {}),
      })),
    );
  },
);
