import { readFileSync } from "node:fs";
import path from "node:path";

type DeployClient = {
  deployContract: (options: Record<string, unknown>) => Promise<string>;
  waitForTransactionReceipt: (options: Record<string, unknown>) => Promise<Receipt>;
};

type Receipt = Record<string, any>;

function json(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? `${nested.toString()}n` : nested);
}

function readField(receipt: Receipt, ...keys: string[]): unknown {
  for (const key of keys) if (receipt[key] !== undefined) return receipt[key];
  return undefined;
}

function deploymentAddress(receipt: Receipt): string {
  const data = receipt.data && typeof receipt.data === "object" ? receipt.data : {};
  return String(readField(receipt, "contractAddress", "contract_address") || data.contract_address || data.contractAddress || "");
}

function assertSuccessfulDeployment(receipt: Receipt): void {
  const status = String(readField(receipt, "statusName", "status") || "");
  const execution = String(readField(receipt, "txExecutionResultName", "txExecutionResult", "executionResult") || "");
  const consensus = String(readField(receipt, "resultName", "result", "consensusResult") || "");
  const finalized = status === "FINALIZED" || status === "7";
  const finished = execution === "FINISHED_WITH_RETURN" || execution === "1" || receipt.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS";
  const agreed = consensus === "AGREE" || consensus === "MAJORITY_AGREE" || consensus === "1" || consensus === "6";
  if (!finalized || !finished || !agreed) throw new Error(`Deployment did not satisfy FINALIZED + FINISHED_WITH_RETURN + AGREE. Receipt: ${json(receipt)}`);
  if (!deploymentAddress(receipt)) throw new Error(`Deployment finalized without a contract address. Receipt: ${json(receipt)}`);
}

export default async function main(client: DeployClient): Promise<void> {
  const filePath = path.resolve(process.cwd(), "contracts/nimbuspact.py");
  const contractCode = new Uint8Array(readFileSync(filePath));
  const deploymentTransaction = await client.deployContract({ code: contractCode, args: [] });
  const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction, status: "FINALIZED", retries: 200, interval: 3000 });
  assertSuccessfulDeployment(receipt);

  console.log("NimbusPact V2 deployment finalized", {
    deploymentTransaction,
    contractAddress: deploymentAddress(receipt),
    status: readField(receipt, "statusName", "status"),
    execution: readField(receipt, "txExecutionResultName", "txExecutionResult", "executionResult"),
    consensus: readField(receipt, "resultName", "result", "consensusResult"),
  });
}
