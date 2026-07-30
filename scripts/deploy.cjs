const hre = require("hardhat");

async function main() {
  const contract = await hre.ethers.deployContract("ReportRegistry");

  await contract.waitForDeployment();

  console.log("=================================");
  console.log("ReportRegistry deployed to:");
  console.log(await contract.getAddress());
  console.log("=================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});