import { describe, expect, it } from "vitest";

import { buildVsixInstallArgs } from "../src/launch/installVsix";

describe("VSIX installation launch contract", () => {
  it("binds installation to the rep's isolated user data and extension directories", () => {
    expect(buildVsixInstallArgs("C:\\build\\mssql.vsix", "C:\\profile", "C:\\extensions")).toEqual([
      "--install-extension",
      "C:\\build\\mssql.vsix",
      "--force",
      "--extensions-dir",
      "C:\\extensions",
      "--user-data-dir",
      "C:\\profile",
    ]);
  });
});
