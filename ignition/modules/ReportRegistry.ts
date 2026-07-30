import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("ReportRegistryModule", (m) => {
  const reportRegistry = m.contract("ReportRegistry");

  return { reportRegistry };
});