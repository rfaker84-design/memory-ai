import { assertProductionAuthConfiguration } from "../../src/server/auth/production-config";
import { getStagingRuntimeConfiguration } from "../../src/server/runtime/staging-contract";

assertProductionAuthConfiguration(process.env);
const configuration = getStagingRuntimeConfiguration(process.env);

console.log(JSON.stringify({
  deploymentEnvironment: "staging",
  databaseName: configuration.databaseName,
  fixedSmsPhoneCount: configuration.fixedSmsPhones.length,
  appOrigin: "https://app.staging.yijianmemory.cn",
  apiOrigin: "https://api.staging.yijianmemory.cn",
  mediaRootConfigured: true,
  mockProviders: true,
}, null, 2));
